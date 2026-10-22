//! Application lifecycle.
//!
//! Responsibilities:
//!  • own the SQLite library, the playback service and widget settings;
//!  • broadcast playback state to every window;
//!  • keep playback alive when the library window is hidden or closed while the
//!    desktop widget is still visible.

mod commands;
mod db;
mod library;
mod metadata;
mod model;
mod playback;

use std::time::Duration;

use parking_lot::Mutex;
use tauri::{Emitter, Manager, WindowEvent};

use commands::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let database = db::Database::open()?;
            let player = playback::PlaybackService::new()?;
            let widget = database
                .load_snapshot()
                .ok()
                .flatten()
                .map(|snapshot| snapshot.widget)
                .unwrap_or_default();

            app.manage(AppState {
                db: Mutex::new(database),
                player,
                widget: Mutex::new(widget),
            });

            // State broadcaster. Emits only when something actually changed, so
            // there is no polling traffic while playback is idle.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_payload = String::new();
                loop {
                    std::thread::sleep(Duration::from_millis(200));
                    let Some(state) = handle.try_state::<AppState>() else {
                        continue;
                    };
                    state.player.tick();
                    let payload = state.player.state();
                    if let Ok(encoded) = serde_json::to_string(&payload) {
                        if encoded != last_payload {
                            last_payload = encoded;
                            let _ = handle.emit("playback://state", payload);
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the library window must not kill playback while the widget
            // is showing: hide the window instead and let the widget keep driving
            // the shared playback service.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let widget_visible = window
                        .app_handle()
                        .get_webview_window("widget")
                        .map(|w| w.is_visible().unwrap_or(false))
                        .unwrap_or(false);
                    if widget_visible {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot_load,
            commands::snapshot_save,
            commands::pick_folder,
            commands::pick_tracks,
            commands::import_folder,
            commands::import_tracks,
            commands::refresh_folder,
            commands::remove_folder,
            commands::remove_track,
            commands::rename_folder,
            commands::player_play_queue,
            commands::player_play,
            commands::player_pause,
            commands::player_toggle,
            commands::player_stop,
            commands::player_seek,
            commands::player_next,
            commands::player_previous,
            commands::player_set_volume,
            commands::player_set_shuffle,
            commands::player_set_repeat,
            commands::widget_show,
            commands::widget_hide,
            commands::widget_set_always_on_top,
            commands::widget_set_bounds,
            commands::open_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vesper");
}
