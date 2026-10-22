//! Tauri command surface. Every function here is called from
//! `src/state/bridge.ts` with the same name in snake_case.

use std::collections::HashSet;
use std::path::PathBuf;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::Database;
use crate::library;
use crate::model::{AppSnapshot, WidgetSettings};
use crate::playback::{PlaybackService, QueueItem};

pub struct AppState {
    pub db: Mutex<Database>,
    pub player: PlaybackService,
    pub widget: Mutex<WidgetSettings>,
}

/* ----------------------------- library ----------------------------- */

#[tauri::command]
pub fn snapshot_load(state: State<'_, AppState>) -> Result<Option<AppSnapshot>, String> {
    state.db.lock().load_snapshot().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snapshot_save(state: State<'_, AppState>, snapshot: AppSnapshot) -> Result<(), String> {
    state
        .db
        .lock()
        .save_snapshot(&snapshot)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_tracks(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app
        .dialog()
        .file()
        .add_filter("Audio", &["mp3", "wav", "flac", "m4a", "aac", "ogg", "oga", "opus", "wma", "aiff"])
        .blocking_pick_files();
    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string())
        .collect())
}

#[tauri::command]
pub fn import_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    recursive: bool,
) -> Result<serde_json::Value, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Not a readable directory: {path}"));
    }

    let db = state.db.lock();
    let mut snapshot = db.load_snapshot().map_err(|e| e.to_string())?.unwrap_or_else(|| AppSnapshot {
        version: 1,
        library: Default::default(),
        settings: Default::default(),
        widget: WidgetSettings::default(),
        playback: Default::default(),
    });

    let existing: HashSet<String> = snapshot.library.tracks.keys().cloned().collect();
    let id = library::track_id(&format!("{path}:folder"));
    let outcome = library::scan_folder(&root, recursive, Some(&id), &existing, &db.data_dir.join("artwork"))
        .map_err(|e| e.to_string())?;

    let playlist = library::build_playlist(&root, &id, recursive, &outcome.tracks);
    for track in &outcome.tracks {
        snapshot
            .library
            .tracks
            .insert(track.id.clone(), serde_json::to_value(track).map_err(|e| e.to_string())?);
    }
    snapshot.library.folders.retain(|f| f.id != playlist.id);
    snapshot.library.folders.push(playlist.clone());
    db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
    drop(db);

    let _ = app.emit("library://changed", ());
    Ok(serde_json::json!({
        "added": outcome.tracks.len(),
        "skippedDuplicates": outcome.skipped_duplicates,
        "missing": outcome.missing,
        "playlist": playlist,
    }))
}

#[tauri::command]
pub fn import_tracks(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let mut snapshot = db.load_snapshot().map_err(|e| e.to_string())?.unwrap_or_else(|| AppSnapshot {
        version: 1,
        library: Default::default(),
        settings: Default::default(),
        widget: WidgetSettings::default(),
        playback: Default::default(),
    });

    let existing: HashSet<String> = snapshot.library.tracks.keys().cloned().collect();
    let mut added = 0usize;
    let mut skipped = 0usize;

    for path in &paths {
        let file = PathBuf::from(path);
        if !file.is_file() {
            skipped += 1;
            continue;
        }
        // Only the selected file is added — the parent folder is never scanned.
        let id = library::track_id(path);
        if existing.contains(&id) {
            skipped += 1;
            continue;
        }
        let meta = crate::metadata::read(&file, &db.data_dir.join("artwork")).unwrap_or_default();
        let size = std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
        let title = meta
            .title
            .clone()
            .unwrap_or_else(|| crate::metadata::title_from_file_name(&file));
        let track = crate::model::Track {
            id: id.clone(),
            title,
            artist: meta.artist,
            album: meta.album,
            duration: meta.duration,
            path: path.clone(),
            key: id.clone(),
            artwork: meta.artwork,
            source_kind: "loose".into(),
            folder_id: None,
            size_bytes: Some(size),
            missing: false,
            error: None,
        };
        snapshot
            .library
            .tracks
            .insert(id.clone(), serde_json::to_value(&track).map_err(|e| e.to_string())?);
        snapshot.library.loose_track_ids.push(id);
        added += 1;
    }

    db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
    drop(db);
    let _ = app.emit("library://changed", ());
    Ok(serde_json::json!({ "added": added, "skippedDuplicates": skipped }))
}

#[tauri::command]
pub fn refresh_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let mut snapshot = db.load_snapshot().map_err(|e| e.to_string())?.ok_or("no library")?;
    let folder = snapshot
        .library
        .folders
        .iter()
        .find(|f| f.id == id)
        .cloned()
        .ok_or("playlist not found")?;

    let root = PathBuf::from(&folder.path);
    if !root.is_dir() {
        // Preserve the entry — a missing folder is a recoverable state, never a
        // reason to erase the playlist.
        for f in snapshot.library.folders.iter_mut() {
            if f.id == id {
                f.missing = true;
            }
        }
        db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
        drop(db);
        let _ = app.emit("library://changed", ());
        return Err(format!("Folder unavailable: {}", folder.path));
    }

    let existing: HashSet<String> = snapshot.library.tracks.keys().cloned().collect();
    let outcome = library::scan_folder(
        &root,
        folder.recursive,
        Some(&id),
        &existing,
        &db.data_dir.join("artwork"),
    )
    .map_err(|e| e.to_string())?;

    for track in &outcome.tracks {
        snapshot
            .library
            .tracks
            .insert(track.id.clone(), serde_json::to_value(track).map_err(|e| e.to_string())?);
    }
    for f in snapshot.library.folders.iter_mut() {
        if f.id == id {
            f.missing = false;
            f.last_scanned_at = Some(library::now_ms());
            f.track_ids = outcome.tracks.iter().map(|t| t.id.clone()).collect();
        }
    }
    db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
    drop(db);
    let _ = app.emit("library://changed", ());
    Ok(serde_json::json!({
        "added": outcome.tracks.len(),
        "skippedDuplicates": outcome.skipped_duplicates,
    }))
}

/// Removes the library entry only. The audio file is never deleted.
#[tauri::command]
pub fn remove_folder(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock();
    let mut snapshot = db.load_snapshot().map_err(|e| e.to_string())?.ok_or("no library")?;
    let track_ids: Vec<String> = snapshot
        .library
        .folders
        .iter()
        .find(|f| f.id == id)
        .map(|f| f.track_ids.clone())
        .unwrap_or_default();

    for track_id in track_ids {
        if let Some(track) = snapshot.library.tracks.get_mut(&track_id) {
            if let Some(value) = track.as_object_mut() {
                if value.get("sourceKind").and_then(|v| v.as_str()) == Some("folder") {
                    snapshot.library.tracks.remove(&track_id);
                }
            }
        }
    }
    snapshot.library.folders.retain(|f| f.id != id);
    db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
    drop(db);
    let _ = app.emit("library://changed", ());
    Ok(())
}

#[tauri::command]
pub fn remove_track(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock();
    let mut snapshot = db.load_snapshot().map_err(|e| e.to_string())?.ok_or("no library")?;
    snapshot.library.tracks.remove(&id);
    snapshot.library.loose_track_ids.retain(|t| t != &id);
    for folder in snapshot.library.folders.iter_mut() {
        folder.track_ids.retain(|t| t != &id);
    }
    db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
    drop(db);
    let _ = app.emit("library://changed", ());
    Ok(())
}

#[tauri::command]
pub fn rename_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), String> {
    let db = state.db.lock();
    let mut snapshot = db.load_snapshot().map_err(|e| e.to_string())?.ok_or("no library")?;
    for folder in snapshot.library.folders.iter_mut() {
        if folder.id == id {
            // Display name only — the physical folder is never renamed.
            folder.name = name.trim().to_string();
        }
    }
    db.save_snapshot(&snapshot).map_err(|e| e.to_string())?;
    drop(db);
    let _ = app.emit("library://changed", ());
    Ok(())
}

/* ----------------------------- playback ---------------------------- */

fn queue_items(snapshot: &AppSnapshot, ids: &[String]) -> Vec<QueueItem> {
    ids.iter()
        .filter_map(|id| snapshot.library.tracks.get(id))
        .filter_map(|value| serde_json::from_value::<crate::model::Track>(value.clone()).ok())
        .map(|track| QueueItem {
            id: track.id,
            path: track.path,
            duration: track.duration,
        })
        .collect()
}

#[tauri::command]
pub fn player_play_queue(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
    start_index: usize,
    shuffle: bool,
) -> Result<(), String> {
    let snapshot = state.db.lock().load_snapshot().map_err(|e| e.to_string())?.ok_or("no library")?;
    let items = queue_items(&snapshot, &ids);
    state
        .player
        .set_queue(items, start_index, shuffle)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("playback://state", state.player.state());
    Ok(())
}

#[tauri::command]
pub fn player_play(state: State<'_, AppState>) -> Result<(), String> {
    state.player.play();
    Ok(())
}

#[tauri::command]
pub fn player_pause(state: State<'_, AppState>) -> Result<(), String> {
    state.player.pause();
    Ok(())
}

#[tauri::command]
pub fn player_toggle(state: State<'_, AppState>) -> Result<(), String> {
    state.player.toggle();
    Ok(())
}

#[tauri::command]
pub fn player_stop(state: State<'_, AppState>) -> Result<(), String> {
    state.player.stop();
    Ok(())
}

#[tauri::command]
pub fn player_seek(state: State<'_, AppState>, seconds: f64) -> Result<(), String> {
    state.player.seek(seconds);
    Ok(())
}

#[tauri::command]
pub fn player_next(state: State<'_, AppState>) -> Result<(), String> {
    state.player.next();
    Ok(())
}

#[tauri::command]
pub fn player_previous(state: State<'_, AppState>) -> Result<(), String> {
    state.player.previous();
    Ok(())
}

#[tauri::command]
pub fn player_set_volume(state: State<'_, AppState>, volume: f64, muted: Option<bool>) -> Result<(), String> {
    let muted = muted.unwrap_or_else(|| state.player.state().muted);
    state.player.set_volume(volume, muted);
    Ok(())
}

#[tauri::command]
pub fn player_set_shuffle(state: State<'_, AppState>, value: bool) -> Result<(), String> {
    state.player.set_shuffle(value);
    Ok(())
}

#[tauri::command]
pub fn player_set_repeat(state: State<'_, AppState>, value: crate::model::RepeatMode) -> Result<(), String> {
    state.player.set_repeat(value);
    Ok(())
}

/* ------------------------------ widget ----------------------------- */

#[tauri::command]
pub fn widget_show(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state.widget.lock().clone();
    if let Some(window) = app.get_webview_window("widget") {
        let _ = window.set_always_on_top(settings.always_on_top);
        let _ = window.set_size(tauri::LogicalSize::new(settings.width, settings.height));
        if settings.x > 0.0 || settings.y > 0.0 {
            let _ = window.set_position(tauri::LogicalPosition::new(settings.x, settings.y));
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn widget_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("widget") {
        // Hiding the widget never stops playback — the sink lives in AppState.
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn widget_set_always_on_top(app: AppHandle, state: State<'_, AppState>, value: bool) -> Result<(), String> {
    state.widget.lock().always_on_top = value;
    if let Some(window) = app.get_webview_window("widget") {
        let _ = window.set_always_on_top(value);
    }
    Ok(())
}

#[tauri::command]
pub fn widget_set_bounds(state: State<'_, AppState>, settings: WidgetSettings) -> Result<(), String> {
    *state.widget.lock() = settings;
    Ok(())
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Path unavailable: {path}"));
    }
    library::open_in_explorer(&path).map_err(|e| e.to_string())
}
