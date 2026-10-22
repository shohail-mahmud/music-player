//! The playback service.
//!
//! It owns the Windows audio device (`rodio` → `cpal`) and the play queue, and
//! lives in the Tauri `AppState` — *not* in any window. Closing or hiding the
//! library window therefore never stops the music; the widget keeps driving the
//! same sink, and the widget window can be hidden just as safely.
//!
//! Queue policy (mirrors `src/lib/shuffle.ts`, so both sides behave identically):
//!  • `base_queue` keeps the playlist order the user chose.
//!  • `queue` is the play order — a Fisher–Yates permutation when shuffle is on.
//!  • No track repeats inside a shuffle cycle; the cycle wraps only under
//!    `Repeat::All`.
//!  • `Repeat::One` loops the current track on natural end-of-file only.

use std::io::BufReader;
use std::path::Path;
use std::time::Duration;

use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};

use crate::model::{PlaybackStateEvent, PlaybackStatus, RepeatMode};

#[derive(Debug, Clone)]
pub struct QueueItem {
    pub id: String,
    pub path: String,
    pub duration: f64,
}

pub struct PlaybackService {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    sink: Mutex<Option<Sink>>,
    state: Mutex<PlaybackStateEvent>,
    queue: Mutex<Vec<QueueItem>>,
    base_queue: Mutex<Vec<QueueItem>>,
    /// Guards against duplicate end-of-track handling.
    advancing: Mutex<bool>,
}

fn shuffle_in_place(items: &mut Vec<QueueItem>, keep_first: bool) {
    if items.len() < 2 {
        return;
    }
    let start = if keep_first { 1 } else { 0 };
    for i in (start + 1..items.len()).rev() {
        let j = start + (fastrand_usize(i - start + 1));
        items.swap(i, j);
    }
}

/// Small xorshift — avoids pulling in an RNG dependency for one function.
fn fastrand_usize(bound: usize) -> usize {
    use std::cell::Cell;
    thread_local! {
        static SEED: Cell<u64> = const { Cell::new(0x9E3779B97F4A7C15) };
    }
    SEED.with(|s| {
        let mut x = s.get();
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        s.set(x);
        (x as usize) % bound.max(1)
    })
}

impl PlaybackService {
    pub fn new() -> Result<Self> {
        let (stream, handle) =
            OutputStream::try_default().map_err(|err| anyhow!("no audio output device: {err}"))?;
        Ok(PlaybackService {
            _stream: stream,
            handle,
            sink: Mutex::new(None),
            state: Mutex::new(PlaybackStateEvent::default()),
            queue: Mutex::new(Vec::new()),
            base_queue: Mutex::new(Vec::new()),
            advancing: Mutex::new(false),
        })
    }

    pub fn state(&self) -> PlaybackStateEvent {
        let mut state = self.state.lock().clone();
        if let Some(sink) = self.sink.lock().as_ref() {
            state.position = sink.get_pos().as_secs_f64();
        }
        state.queue = self.queue.lock().iter().map(|i| i.id.clone()).collect();
        state.base_queue = self.base_queue.lock().iter().map(|i| i.id.clone()).collect();
        state
    }

    fn rebuild_order(&self, current_id: Option<&str>, shuffle: bool) {
        let base = self.base_queue.lock().clone();
        if !shuffle {
            *self.queue.lock() = base;
        } else {
            let mut rest: Vec<QueueItem> = base
                .iter()
                .filter(|item| Some(item.id.as_str()) != current_id)
                .cloned()
                .collect();
            shuffle_in_place(&mut rest, false);
            let mut order = Vec::with_capacity(base.len());
            if let Some(current) = base.iter().find(|item| Some(item.id.as_str()) == current_id) {
                order.push(current.clone());
            }
            order.extend(rest);
            *self.queue.lock() = order;
        }
        if let Some(id) = current_id {
            let index = self
                .queue
                .lock()
                .iter()
                .position(|item| item.id == id)
                .unwrap_or(0) as i64;
            self.state.lock().index = index;
        }
    }

    /// Load a new queue and start the item at `start_index`.
    pub fn set_queue(&self, items: Vec<QueueItem>, start_index: usize, shuffle: bool) -> Result<()> {
        let current = items.get(start_index).map(|i| i.id.clone());
        *self.base_queue.lock() = items;
        {
            let mut state = self.state.lock();
            state.shuffle = shuffle;
            state.index = start_index as i64;
        }
        self.rebuild_order(current.as_deref(), shuffle);
        self.play_index(start_index)
    }

    pub fn play_index(&self, index: usize) -> Result<()> {
        let item = {
            let queue = self.queue.lock();
            queue.get(index).cloned()
        };
        let Some(item) = item else {
            self.stop();
            return Ok(());
        };

        let path = Path::new(&item.path);
        if !path.exists() {
            let mut state = self.state.lock();
            state.status = PlaybackStatus::Error;
            state.error = Some(format!("File not found: {}", item.path));
            return Err(anyhow!("file not found: {}", item.path));
        }

        let file = std::fs::File::open(path)?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|err| anyhow!("unsupported or corrupt audio file: {err}"))?;

        let sink = Sink::try_new(&self.handle)?;
        sink.set_volume(self.effective_volume());
        sink.append(source);
        sink.play();

        *self.sink.lock() = Some(sink);
        {
            let mut state = self.state.lock();
            state.status = PlaybackStatus::Playing;
            state.track_id = Some(item.id.clone());
            state.index = index as i64;
            state.position = 0.0;
            state.duration = item.duration;
            state.error = None;
        }
        Ok(())
    }

    fn effective_volume(&self) -> f32 {
        let state = self.state.lock();
        if state.muted {
            0.0
        } else {
            state.volume.clamp(0.0, 1.0) as f32
        }
    }

    pub fn play(&self) {
        if let Some(sink) = self.sink.lock().as_ref() {
            sink.play();
            self.state.lock().status = PlaybackStatus::Playing;
        }
    }

    pub fn pause(&self) {
        if let Some(sink) = self.sink.lock().as_ref() {
            sink.pause();
            self.state.lock().status = PlaybackStatus::Paused;
        }
    }

    pub fn toggle(&self) {
        let playing = matches!(self.state.lock().status, PlaybackStatus::Playing);
        if playing {
            self.pause();
        } else {
            self.play();
        }
    }

    pub fn stop(&self) {
        if let Some(sink) = self.sink.lock().take() {
            sink.stop();
        }
        let mut state = self.state.lock();
        state.status = PlaybackStatus::Idle;
        state.track_id = None;
        state.position = 0.0;
        state.index = -1;
    }

    pub fn seek(&self, seconds: f64) {
        if let Some(sink) = self.sink.lock().as_ref() {
            let clamped = seconds.max(0.0);
            if sink.try_seek(Duration::from_secs_f64(clamped)).is_ok() {
                self.state.lock().position = clamped;
            }
        }
    }

    pub fn set_volume(&self, volume: f64, muted: bool) {
        {
            let mut state = self.state.lock();
            state.volume = volume.clamp(0.0, 1.0);
            state.muted = muted;
        }
        let volume = self.effective_volume();
        if let Some(sink) = self.sink.lock().as_ref() {
            sink.set_volume(volume);
        }
    }

    pub fn set_shuffle(&self, shuffle: bool) {
        let current = self.state.lock().track_id.clone();
        self.state.lock().shuffle = shuffle;
        self.rebuild_order(current.as_deref(), shuffle);
    }

    pub fn set_repeat(&self, repeat: RepeatMode) {
        self.state.lock().repeat = repeat;
    }

    pub fn next(&self) {
        let mut state = self.state.lock();
        let index = state.index;
        let repeat = state.repeat;
        let shuffle = state.shuffle;
        drop(state);

        let length = self.queue.lock().len() as i64;
        if length == 0 {
            return;
        }
        let target = if index + 1 < length {
            Some(index + 1)
        } else if repeat == RepeatMode::All {
            Some(0)
        } else {
            None
        };

        if let Some(target) = target {
            if shuffle {
                // keep the cycle stable — the order was fixed when shuffle began
            }
            let _ = self.play_index(target as usize);
        } else {
            self.pause();
            self.seek(self.state.lock().duration);
        }
    }

    pub fn previous(&self) {
        let state = self.state.lock();
        let index = state.index;
        let position = state.position;
        drop(state);
        if position > 3.0 || index <= 0 {
            self.seek(0.0);
            return;
        }
        let _ = self.play_index((index - 1) as usize);
    }

    /// Called from the ticker thread ~5×/second.
    /// Returns `true` when a state event should be broadcast.
    pub fn tick(&self) -> bool {
        let finished = {
            let sink_guard = self.sink.lock();
            match sink_guard.as_ref() {
                Some(sink) => {
                    let state_playing = matches!(self.state.lock().status, PlaybackStatus::Playing);
                    state_playing && sink.empty()
                }
                None => false,
            }
        };

        if finished {
            let mut guard = self.advancing.lock();
            if !*guard {
                *guard = true;
                let repeat = self.state.lock().repeat;
                if repeat == RepeatMode::One {
                    let index = self.state.lock().index;
                    let _ = self.play_index(index as usize);
                } else {
                    self.next();
                }
                *guard = false;
            }
        }

        if let Some(sink) = self.sink.lock().as_ref() {
            self.state.lock().position = sink.get_pos().as_secs_f64();
        }
        true
    }
}
