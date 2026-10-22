//! Domain model shared with `src/types.ts`.
//!
//! Every struct is serialised with camelCase keys so the TypeScript layer can
//! consume the payloads without translation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    Off,
    All,
    One,
}

impl Default for RepeatMode {
    fn default() -> Self {
        RepeatMode::Off
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Idle,
    Loading,
    Playing,
    Paused,
    Error,
}

impl Default for PlaybackStatus {
    fn default() -> Self {
        PlaybackStatus::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// Seconds. `0.0` means "not yet known".
    pub duration: f64,
    /// Original location on disk. Files are never copied into app storage.
    pub path: String,
    /// Normalised identity key used for de-duplication.
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(rename = "sourceKind")]
    pub source_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub missing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPlaylist {
    pub id: String,
    pub name: String,
    pub path: String,
    pub track_ids: Vec<String>,
    pub recursive: bool,
    pub missing: bool,
    pub added_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_scanned_at: Option<u64>,
    #[serde(default)]
    pub sample: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryState {
    pub folders: Vec<FolderPlaylist>,
    pub tracks: serde_json::Map<String, serde_json::Value>,
    pub loose_track_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub recursive_scan: bool,
    pub remember_last_playlist: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_playlist_id: Option<String>,
    pub launch_at_startup: bool,
    pub show_sample_collection: bool,
    pub artwork_size: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            recursive_scan: false,
            remember_last_playlist: true,
            last_playlist_id: None,
            launch_at_startup: false,
            show_sample_collection: false,
            artwork_size: 320,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSettings {
    pub visible: bool,
    pub always_on_top: bool,
    pub opacity: f64,
    pub size: String,
    pub show_artwork: bool,
    pub show_progress: bool,
    pub show_volume: bool,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub click_through: bool,
}

impl Default for WidgetSettings {
    fn default() -> Self {
        WidgetSettings {
            visible: false,
            always_on_top: false,
            opacity: 0.94,
            size: "expanded".into(),
            show_artwork: true,
            show_progress: true,
            show_volume: true,
            x: 0.0,
            y: 0.0,
            width: 384.0,
            height: 188.0,
            click_through: false,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    pub position: f64,
    pub volume: f64,
    pub muted: bool,
    pub shuffle: bool,
    pub repeat: RepeatMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub version: u32,
    pub library: LibraryState,
    pub settings: Settings,
    pub widget: WidgetSettings,
    pub playback: PlaybackSnapshot,
}

/// Full playback state broadcast to every window on `playback://state`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStateEvent {
    pub status: PlaybackStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub volume: f64,
    pub muted: bool,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub queue: Vec<String>,
    pub base_queue: Vec<String>,
    pub index: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
