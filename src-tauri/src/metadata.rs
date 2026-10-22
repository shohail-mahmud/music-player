//! Metadata extraction.
//!
//! Only the tag block is read (via `lofty`), never the whole audio payload, and
//! embedded artwork is written once into the per-user artwork cache. Nothing is
//! uploaded and nothing is invented: fields that the file does not carry stay
//! `None` and the UI falls back to the file name.

use std::path::{Path, PathBuf};

use anyhow::Result;
use lofty::prelude::*;
use lofty::picture::PictureType;
use lofty::probe::Probe;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Default)]
pub struct TrackMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: f64,
    pub artwork: Option<String>,
}

fn artwork_cache_path(cache_dir: &Path, bytes: &[u8], extension: &str) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hex::encode(hasher.finalize());
    cache_dir.join(format!("{digest}.{extension}"))
}

pub fn read(path: &Path, cache_dir: &Path) -> Result<TrackMeta> {
    let mut meta = TrackMeta::default();

    let tagged_file = match Probe::open(path).and_then(|p| p.read()) {
        Ok(file) => file,
        Err(err) => {
            // A file the decoder cannot parse is still a library entry — the
            // caller falls back to the file name and marks it for review.
            eprintln!("[vesper] metadata unreadable for {}: {err}", path.display());
            return Ok(meta);
        }
    };

    meta.duration = tagged_file.properties().duration().as_secs_f64();

    if let Some(tag) = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
    {
        meta.title = tag
            .get_string(&ItemKey::TrackTitle)
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty());
        meta.artist = tag
            .get_string(&ItemKey::TrackArtist)
            .or_else(|| tag.get_string(&ItemKey::AlbumArtist))
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty());
        meta.album = tag
            .get_string(&ItemKey::AlbumTitle)
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty());

        if let Some(picture) = tag
            .pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first())
        {
            if let Some(cached) = cache_artwork(cache_dir, picture) {
                meta.artwork = Some(cached.to_string_lossy().to_string());
            }
        }
    }

    Ok(meta)
}

fn cache_artwork(cache_dir: &Path, picture: &lofty::picture::Picture) -> Option<PathBuf> {
    let bytes = picture.data();
    if bytes.len() < 512 || bytes.len() > 4_000_000 {
        return None;
    }
    let extension = match picture.mime_type() {
        Some(lofty::picture::MimeType::Png) => "png",
        Some(lofty::picture::MimeType::Jpeg) => "jpg",
        _ => "jpg",
    };
    let target = artwork_cache_path(cache_dir, bytes, extension);
    if !target.exists() {
        std::fs::write(&target, bytes).ok()?;
    }
    Some(target)
}

/// Human-readable title fallback when the file carries no title tag.
pub fn title_from_file_name(path: &Path) -> String {
    let raw = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown track".into());
    let trimmed = raw.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ' ' || c == '_' || c == '-');
    let trimmed = trimmed.replace('_', " ");
    if trimmed.trim().is_empty() { raw } else { trimmed.trim().to_string() }
}
