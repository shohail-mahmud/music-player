//! Persistent local library.
//!
//! The database lives in the per-user application-data directory
//! (`%LOCALAPPDATA%\Vesper\library.db` on Windows) — never in the install
//! directory and never in a temporary folder — so the library survives
//! application restarts, Windows restarts and application updates.

use std::path::PathBuf;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::model::{
    AppSnapshot, FolderPlaylist, LibraryState, PlaybackSnapshot, RepeatMode, Settings, WidgetSettings,
};

pub struct Database {
    conn: Connection,
    pub data_dir: PathBuf,
}

impl Database {
    pub fn open() -> Result<Self> {
        let data_dir = dirs::data_dir()
            .context("could not resolve the per-user application data directory")?
            .join("Vesper");
        std::fs::create_dir_all(&data_dir)?;
        std::fs::create_dir_all(data_dir.join("artwork"))?;
        let conn = Connection::open(data_dir.join("library.db"))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA synchronous = NORMAL;",
        )?;
        let db = Database { conn, data_dir };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS folders (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                path            TEXT NOT NULL,
                recursive       INTEGER NOT NULL DEFAULT 0,
                missing         INTEGER NOT NULL DEFAULT 0,
                added_at        INTEGER NOT NULL,
                last_scanned_at INTEGER,
                sample          INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS tracks (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL,
                artist     TEXT,
                album      TEXT,
                duration   REAL NOT NULL DEFAULT 0,
                path       TEXT NOT NULL,
                key        TEXT NOT NULL,
                artwork    TEXT,
                source_kind TEXT NOT NULL,
                folder_id  TEXT,
                size_bytes INTEGER,
                missing    INTEGER NOT NULL DEFAULT 0,
                error      TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_key ON tracks(key);
            CREATE TABLE IF NOT EXISTS folder_tracks (
                folder_id TEXT NOT NULL,
                track_id  TEXT NOT NULL,
                position  INTEGER NOT NULL,
                PRIMARY KEY (folder_id, track_id)
            );
            CREATE TABLE IF NOT EXISTS playback (
                id       INTEGER PRIMARY KEY CHECK (id = 1),
                track_id TEXT,
                position REAL NOT NULL DEFAULT 0,
                volume   REAL NOT NULL DEFAULT 0.72,
                muted    INTEGER NOT NULL DEFAULT 0,
                shuffle  INTEGER NOT NULL DEFAULT 0,
                repeat   TEXT NOT NULL DEFAULT 'off'
            );
            INSERT OR IGNORE INTO playback (id) VALUES (1);
            "#,
        )?;
        Ok(())
    }

    pub fn load_snapshot(&self) -> Result<Option<AppSnapshot>> {
        let folders: Vec<FolderPlaylist> = {
            let mut stmt = self.conn.prepare(
                "SELECT id, name, path, recursive, missing, added_at, last_scanned_at, sample
                 FROM folders ORDER BY added_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(FolderPlaylist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    recursive: row.get::<_, i64>(3)? != 0,
                    missing: row.get::<_, i64>(4)? != 0,
                    added_at: row.get::<_, i64>(5)? as u64,
                    last_scanned_at: row.get::<_, Option<i64>>(6)?.map(|v| v as u64),
                    sample: row.get::<_, i64>(7)? != 0,
                    track_ids: Vec::new(),
                })
            })?;
            let mut folders: Vec<FolderPlaylist> = rows.filter_map(|r| r.ok()).collect();

            let mut order = self.conn.prepare(
                "SELECT track_id FROM folder_tracks WHERE folder_id = ?1 ORDER BY position ASC",
            )?;
            for folder in folders.iter_mut() {
                let ids = order
                    .query_map([&folder.id], |row| row.get::<_, String>(0))?
                    .filter_map(|r| r.ok())
                    .collect();
                folder.track_ids = ids;
            }
            folders
        };

        let mut tracks = serde_json::Map::new();
        {
            let mut stmt = self.conn.prepare(
                "SELECT id, title, artist, album, duration, path, key, artwork, source_kind,
                        folder_id, size_bytes, missing, error FROM tracks",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(crate::model::Track {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album: row.get(3)?,
                    duration: row.get(4)?,
                    path: row.get(5)?,
                    key: row.get(6)?,
                    artwork: row.get(7)?,
                    source_kind: row.get(8)?,
                    folder_id: row.get(9)?,
                    size_bytes: row.get::<_, Option<i64>>(10)?.map(|v| v as u64),
                    missing: row.get::<_, i64>(11)? != 0,
                    error: row.get(12)?,
                })
            })?;
            for track in rows.filter_map(|r| r.ok()) {
                let id = track.id.clone();
                tracks.insert(id, serde_json::to_value(track)?);
            }
        }

        let loose_track_ids: Vec<String> = folders
            .iter()
            .flat_map(|f| f.track_ids.iter().cloned())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .filter(|id| {
                tracks
                    .get(id)
                    .and_then(|t| t.get("folderId"))
                    .map(|v| v.is_null())
                    .unwrap_or(true)
            })
            .collect();

        let settings: Settings = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = 'settings'", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()?
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let widget: WidgetSettings = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = 'widget'", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()?
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let playback: PlaybackSnapshot = self
            .conn
            .query_row(
                "SELECT track_id, position, volume, muted, shuffle, repeat FROM playback WHERE id = 1",
                [],
                |row| {
                    Ok(PlaybackSnapshot {
                        track_id: row.get(0)?,
                        position: row.get(1)?,
                        volume: row.get(2)?,
                        muted: row.get::<_, i64>(3)? != 0,
                        shuffle: row.get::<_, i64>(4)? != 0,
                        repeat: match row.get::<_, String>(5)?.as_str() {
                            "all" => RepeatMode::All,
                            "one" => RepeatMode::One,
                            _ => RepeatMode::Off,
                        },
                    })
                },
            )
            .optional()?
            .unwrap_or_default();

        Ok(Some(AppSnapshot {
            version: 1,
            library: LibraryState {
                folders,
                tracks,
                loose_track_ids,
            },
            settings,
            widget,
            playback,
        }))
    }

    pub fn save_snapshot(&self, snapshot: &AppSnapshot) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;

        tx.execute("DELETE FROM folder_tracks", [])?;
        for folder in &snapshot.library.folders {
            tx.execute(
                "INSERT INTO folders (id, name, path, recursive, missing, added_at, last_scanned_at, sample)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, path = excluded.path, recursive = excluded.recursive,
                    missing = excluded.missing, last_scanned_at = excluded.last_scanned_at,
                    sample = excluded.sample",
                params![
                    folder.id,
                    folder.name,
                    folder.path,
                    folder.recursive as i64,
                    folder.missing as i64,
                    folder.added_at as i64,
                    folder.last_scanned_at.map(|v| v as i64),
                    folder.sample as i64,
                ],
            )?;
            for (position, track_id) in folder.track_ids.iter().enumerate() {
                tx.execute(
                    "INSERT OR REPLACE INTO folder_tracks (folder_id, track_id, position) VALUES (?1, ?2, ?3)",
                    params![folder.id, track_id, position as i64],
                )?;
            }
        }

        for (id, value) in &snapshot.library.tracks {
            let track: crate::model::Track = serde_json::from_value(value.clone())?;
            tx.execute(
                "INSERT INTO tracks (id, title, artist, album, duration, path, key, artwork,
                                     source_kind, folder_id, size_bytes, missing, error)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title, artist = excluded.artist, album = excluded.album,
                    duration = excluded.duration, path = excluded.path, artwork = excluded.artwork,
                    missing = excluded.missing, error = excluded.error",
                params![
                    id,
                    track.title,
                    track.artist,
                    track.album,
                    track.duration,
                    track.path,
                    track.key,
                    track.artwork,
                    track.source_kind,
                    track.folder_id,
                    track.size_bytes.map(|v| v as i64),
                    track.missing as i64,
                    track.error,
                ],
            )?;
        }

        tx.execute(
            "INSERT INTO settings (key, value) VALUES ('settings', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![serde_json::to_string(&snapshot.settings)?],
        )?;
        tx.execute(
            "INSERT INTO settings (key, value) VALUES ('widget', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![serde_json::to_string(&snapshot.widget)?],
        )?;
        tx.execute(
            "UPDATE playback SET track_id = ?1, position = ?2, volume = ?3, muted = ?4, shuffle = ?5, repeat = ?6 WHERE id = 1",
            params![
                snapshot.playback.track_id,
                snapshot.playback.position,
                snapshot.playback.volume,
                snapshot.playback.muted as i64,
                snapshot.playback.shuffle as i64,
                match snapshot.playback.repeat {
                    RepeatMode::All => "all",
                    RepeatMode::One => "one",
                    RepeatMode::Off => "off",
                },
            ],
        )?;

        tx.commit()?;
        Ok(())
    }
}
