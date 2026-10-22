//! Library operations: scanning folders, importing tracks, de-duplication.
//!
//! Policy:
//!  • Files are read in place — never copied into application storage.
//!  • A folder scan is top-level only unless `recursive` is set for that folder.
//!  • Identity = FNV-style hash of the normalised path (case-folded, separators
//!    unified), with a (size, duration) signature guard so a moved or renamed
//!    file does not produce a second entry in the same playlist.
//!  • Removing an entry never touches the file on disk.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use walkdir::WalkDir;

use crate::metadata;
use crate::model::{FolderPlaylist, Track};

const SUPPORTED: &[&str] = &["mp3", "wav", "flac", "m4a", "aac", "ogg", "oga", "opus", "wma", "aiff", "aif"];

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Normalised identity: back-slashes folded, case lowered, `.`/`..` collapsed.
pub fn normalize_path(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let mut parts: Vec<&str> = Vec::new();
    for segment in unified.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            parts.pop();
            continue;
        }
        parts.push(segment);
    }
    parts.join("/").to_lowercase()
}

pub fn track_id(path: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    normalize_path(path).hash(&mut hasher);
    format!("{:08x}", hasher.finish() as u32)
}

pub fn signature(size_bytes: u64, duration: f64) -> String {
    format!("{size_bytes}:{}", duration.round() as i64)
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

pub struct ScanOutcome {
    pub tracks: Vec<Track>,
    pub skipped_duplicates: usize,
    pub missing: usize,
}

/// Collect audio files under `root`, honouring the nested-directory policy.
pub fn collect_files(root: &Path, recursive: bool) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if recursive {
        for entry in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            if is_audio(entry.path()) {
                files.push(entry.path().to_path_buf());
            }
        }
    } else if let Ok(read_dir) = std::fs::read_dir(root) {
        for entry in read_dir.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() && is_audio(&path) {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

pub fn scan_folder(
    root: &Path,
    recursive: bool,
    folder_id: Option<&str>,
    existing: &HashSet<String>,
    cache_dir: &Path,
) -> Result<ScanOutcome> {
    let mut tracks = Vec::new();
    let mut signatures = HashSet::new();
    let mut skipped_duplicates = 0usize;
    let mut missing = 0usize;

    for file in collect_files(root, recursive) {
        let path_string = file.to_string_lossy().to_string();
        let id = track_id(&path_string);
        if existing.contains(&id) {
            skipped_duplicates += 1;
            continue;
        }

        let meta = metadata::read(&file, cache_dir).unwrap_or_default();
        let duration = meta.duration;
        let size = file_size(&file);
        let signature = signature(size, duration);
        if !signatures.insert(signature) {
            skipped_duplicates += 1;
            continue;
        }

        let title = meta
            .title
            .clone()
            .unwrap_or_else(|| metadata::title_from_file_name(&file));
        if !file.exists() {
            missing += 1;
        }

        tracks.push(Track {
            id: id.clone(),
            title,
            artist: meta.artist,
            album: meta.album,
            duration,
            path: path_string,
            key: id,
            artwork: meta.artwork,
            source_kind: if folder_id.is_some() {
                "folder".into()
            } else {
                "loose".into()
            },
            folder_id: folder_id.map(|s| s.to_string()),
            size_bytes: Some(size),
            missing: false,
            error: None,
        });
    }

    Ok(ScanOutcome {
        tracks,
        skipped_duplicates,
        missing,
    })
}

pub fn folder_display_name(root: &Path) -> String {
    root.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Imported folder".into())
}

pub fn build_playlist(root: &Path, id: &str, recursive: bool, tracks: &[Track]) -> FolderPlaylist {
    FolderPlaylist {
        id: id.to_string(),
        name: folder_display_name(root),
        path: root.to_string_lossy().to_string(),
        track_ids: tracks.iter().map(|t| t.id.clone()).collect(),
        recursive,
        missing: false,
        added_at: now_ms(),
        last_scanned_at: Some(now_ms()),
        sample: false,
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Validate that a path the frontend asks us to read is inside a folder the
/// user actually imported. Arbitrary filesystem access is never exposed.
pub fn is_imported(root: &Path, candidate: &Path) -> bool {
    let root = normalize_path(&root.to_string_lossy());
    let candidate = normalize_path(&candidate.to_string_lossy());
    candidate.starts_with(&format!("{root}/")) || candidate == root
}

pub fn open_in_explorer(path: &str) -> Result<()> {
    let target = PathBuf::from(path);
    let target = target.parent().unwrap_or(&target).to_path_buf();
    std::process::Command::new("explorer")
        .arg(target)
        .spawn()
        .context("could not open Windows Explorer")?;
    Ok(())
}
