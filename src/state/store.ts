/**
 * Shared application state + playback engine.
 *
 * One store serves both windows. The desktop widget is a second Tauri window
 * mounting `WidgetWindow`, which subscribes to the very same state that the
 * library window drives — playback, queue, volume and settings are never
 * duplicated per window.
 *
 * Playback backends:
 *  • native (Tauri)  — the Rust playback service owns the audio device. It is
 *    created in `src-tauri/src/playback.rs` and outlives any window, so hiding
 *    or closing the library window never stops the music.
 *  • web preview     — an HTML5 `<audio>` element for real imported files, and a
 *    real-time transport clock for the clearly-labelled sample collection.
 */

import { useSyncExternalStore } from "react";
import type {
  AppSnapshot,
  FolderPlaylist,
  LibraryState,
  PlaybackState,
  RepeatMode,
  Settings,
  Track,
  WidgetSettings,
} from "../types";
import {
  artistFromFileName,
  folderFromRelativePath,
  isAudioFile,
  normalizePath,
  signatureKey,
  titleFromFileName,
  trackKey,
} from "../lib/path";
import { planImport, selectImportableFiles } from "../lib/import-policy";
import { readTags } from "../lib/id3";
import { buildQueue, nextIndex, previousIndex, shuffleArray } from "../lib/shuffle";
import {
  loadSnapshot,
  native,
  openStateChannel,
  pickFolderFiles,
  pickTrackFiles,
  runtime,
  saveSnapshot,
  events,
} from "./bridge";
import { buildSampleLibrary, FALLBACK_ART } from "./sampleCollection";

export type View =
  | { name: "home" }
  | { name: "playlist"; id: string }
  | { name: "settings" };

export interface Toast {
  id: string;
  tone: "info" | "error" | "success";
  title: string;
  detail?: string;
}

export interface AppState {
  ready: boolean;
  backend: "native" | "web";
  view: View;
  library: LibraryState;
  settings: Settings;
  widget: WidgetSettings;
  playback: PlaybackState;
  toasts: Toast[];
  busy: { label: string; processed: number; total: number } | null;
}

const SNAPSHOT_VERSION = 1;

const defaultSettings: Settings = {
  recursiveScan: false,
  rememberLastPlaylist: true,
  lastPlaylistId: null,
  launchAtStartup: false,
  showSampleCollection: true,
  artworkSize: 320,
};

const defaultWidget: WidgetSettings = {
  visible: true,
  alwaysOnTop: false,
  opacity: 0.94,
  size: "expanded",
  showArtwork: true,
  showProgress: true,
  showVolume: true,
  x: 0,
  y: 0,
  width: 384,
  height: 188,
  clickThrough: false,
};

const defaultPlayback: PlaybackState = {
  status: "idle",
  trackId: null,
  position: 0,
  duration: 0,
  volume: 0.72,
  muted: false,
  shuffle: false,
  repeat: "off",
  queue: [],
  baseQueue: [],
  index: -1,
};

let state: AppState = {
  ready: false,
  backend: runtime.isTauri ? "native" : "web",
  view: { name: "home" },
  library: { folders: [], tracks: {}, looseTrackIds: [] },
  settings: defaultSettings,
  widget: defaultWidget,
  playback: defaultPlayback,
  toasts: [],
  busy: null,
};

const listeners = new Set<() => void>();
let snapshotTimer: number | null = null;
let channelSync: ReturnType<typeof openStateChannel> | null = null;
let isWidgetWindow = false;

function notify() {
  for (const listener of listeners) listener();
  schedulePersist();
  if (!isWidgetWindow && channelSync) {
    const track = state.playback.trackId ? state.library.tracks[state.playback.trackId] : null;
    channelSync.post({ playback: state.playback, widget: state.widget, track: track ?? null });
  }
}

function schedulePersist() {
  if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => {
    void saveSnapshot(toSnapshot(state));
  }, 600);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppState {
  return state;
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  notify();
}

function setPlayback(patch: Partial<PlaybackState>) {
  state = { ...state, playback: { ...state.playback, ...patch } };
  notify();
}

/* ------------------------------------------------------------------ *
 * Snapshots
 * ------------------------------------------------------------------ */

export function toSnapshot(source: AppState): AppSnapshot {
  const { playback } = source;
  return {
    version: SNAPSHOT_VERSION,
    library: source.library,
    settings: source.settings,
    widget: source.widget,
    playback: {
      trackId: playback.trackId,
      position: playback.position,
      volume: playback.volume,
      muted: playback.muted,
      shuffle: playback.shuffle,
      repeat: playback.repeat,
    },
  };
}

function applySnapshot(snapshot: AppSnapshot | null) {
  if (!snapshot) return;
  const sample = snapshot.settings?.showSampleCollection ? buildSampleLibrary() : null;
  const library = snapshot.library ?? { folders: [], tracks: {}, looseTrackIds: [] };
  const hasContent = library.folders.length > 0 || library.looseTrackIds.length > 0;
  setState({
    library: hasContent || !sample ? library : sample,
    settings: { ...defaultSettings, ...(snapshot.settings ?? {}) },
    widget: { ...defaultWidget, ...(snapshot.widget ?? {}) },
    playback: {
      ...defaultPlayback,
      ...(snapshot.playback ?? {}),
      status: "paused",
      position: snapshot.playback?.position ?? 0,
      queue: [],
      baseQueue: [],
      index: -1,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Audio backends (web preview)
 * ------------------------------------------------------------------ */

const fileSources = new Map<string, File>();
const objectUrls = new Map<string, string>();
let audioEl: HTMLAudioElement | null = null;
let virtual: { startedAt: number; offset: number } | null = null;
let tickHandle: number | null = null;
let advancing = false;

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    audioEl.addEventListener("timeupdate", () => {
      if (virtual) return;
      setPlayback({ position: audioEl!.currentTime, duration: safeDuration(audioEl!.duration) });
    });
    audioEl.addEventListener("loadedmetadata", () => {
      setPlayback({ duration: safeDuration(audioEl!.duration) });
    });
    audioEl.addEventListener("ended", () => {
      void handleEnded();
    });
    audioEl.addEventListener("error", () => {
      const track = currentTrack();
      handleTrackError(track, "This file could not be decoded by the browser audio engine.");
    });
    audioEl.addEventListener("playing", () => setPlayback({ status: "playing", error: undefined }));
    audioEl.addEventListener("pause", () => {
      if (state.playback.status !== "idle") setPlayback({ status: "paused" });
    });
  }
  audioEl.volume = state.playback.muted ? 0 : state.playback.volume;
  return audioEl;
}

function safeDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function objectUrlFor(track: Track): string | null {
  const existing = objectUrls.get(track.id);
  if (existing) return existing;
  const file = fileSources.get(track.id);
  if (!file) return null;
  const url = URL.createObjectURL(file);
  objectUrls.set(track.id, url);
  return url;
}

function isVirtual(track: Track): boolean {
  return track.sourceKind === "sample" || !fileSources.has(track.id);
}

function startTicker() {
  if (tickHandle !== null) return;
  tickHandle = window.setInterval(onTick, 160);
}

function stopTicker() {
  if (tickHandle !== null) {
    window.clearInterval(tickHandle);
    tickHandle = null;
  }
}

function onTick() {
  const { playback } = state;
  if (playback.status !== "playing") return;
  if (virtual) {
    const position = virtual.offset + (performance.now() - virtual.startedAt) / 1000;
    const duration = playback.duration;
    if (duration > 0 && position >= duration) {
      setPlayback({ position: duration });
      void handleEnded();
      return;
    }
    setPlayback({ position });
    return;
  }
  if (audioEl) setPlayback({ position: audioEl.currentTime, duration: safeDuration(audioEl.duration) });
}

function currentTrack(): Track | null {
  const id = state.playback.trackId;
  return id ? (state.library.tracks[id] ?? null) : null;
}

function handleTrackError(track: Track | null, message: string) {
  if (track) {
    state.library.tracks[track.id] = { ...track, missing: true, error: message };
  }
  setPlayback({ status: "error", error: message });
  toast("error", "Playback error", track ? `${track.title} — ${message}` : message);
  // Recovery: skip past the broken file instead of stalling the queue.
  window.setTimeout(() => {
    if (state.playback.status === "error") void next(true);
  }, 900);
}

/* ------------------------------------------------------------------ *
 * Public playback actions
 * ------------------------------------------------------------------ */

export function toast(tone: Toast["tone"], title: string, detail?: string) {
  const item: Toast = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tone, title, detail };
  setState({ toasts: [...state.toasts, item] });
  window.setTimeout(() => dismissToast(item.id), 5200);
}

export function dismissToast(id: string) {
  setState({ toasts: state.toasts.filter((t) => t.id !== id) });
}

export async function playTrack(track: Track, queue: Track[] = [track]): Promise<void> {
  const baseQueue = queue.map((t) => t.id);
  const order = state.playback.shuffle ? shuffleArray(baseQueue) : baseQueue;
  const index = Math.max(0, order.indexOf(track.id));
  await startPlayback(track, order, baseQueue, index);
}

export async function playFromList(tracks: Track[], startIndex: number, shuffle: boolean): Promise<void> {
  if (tracks.length === 0) return;
  const baseQueue = tracks.map((t) => t.id);
  let order = baseQueue;
  let index = startIndex;
  if (shuffle) {
    order = shuffleArray(baseQueue);
    index = order.indexOf(baseQueue[startIndex]);
  }
  await startPlayback(tracks[startIndex], order, baseQueue, index);
}

async function startPlayback(track: Track, order: string[], baseQueue: string[], index: number) {
  setPlayback({
    trackId: track.id,
    queue: order,
    baseQueue,
    index,
    position: 0,
    duration: track.duration || 0,
    status: "loading",
    error: undefined,
  });

  if (state.backend === "native") {
    try {
      await native.playerLoad(track.path, 0);
      await native.playerPlay();
      await native.playerSetVolume(state.playback.muted ? 0 : state.playback.volume);
      setPlayback({ status: "playing" });
    } catch (err) {
      handleTrackError(track, err instanceof Error ? err.message : "Native playback failed");
    }
    return;
  }

  virtual = null;
  stopTicker();
  const audio = ensureAudio();
  if (isVirtual(track)) {
    audio.pause();
    audio.removeAttribute("src");
    virtual = { startedAt: performance.now(), offset: 0 };
    setPlayback({ status: "playing", duration: track.duration || 0 });
    startTicker();
    return;
  }

  const url = objectUrlFor(track);
  if (!url) {
    handleTrackError(track, "The original file is no longer available.");
    return;
  }
  audio.src = url;
  audio.currentTime = 0;
  try {
    await audio.play();
    setPlayback({ status: "playing" });
    startTicker();
  } catch (err) {
    handleTrackError(track, err instanceof Error ? err.message : "The browser blocked audio playback.");
  }
}

export async function togglePlay(): Promise<void> {
  const { playback } = state;
  if (!playback.trackId) {
    const first = state.library.looseTrackIds[0] ?? state.library.folders[0]?.trackIds[0];
    if (first) await playTrack(state.library.tracks[first]);
    return;
  }
  if (playback.status === "playing") await pause();
  else await resume();
}

export async function pause(): Promise<void> {
  if (state.backend === "native") {
    await native.playerPause().catch(() => undefined);
    setPlayback({ status: "paused" });
    return;
  }
  if (virtual) {
    virtual.offset += (performance.now() - virtual.startedAt) / 1000;
    virtual = null;
    stopTicker();
    setPlayback({ status: "paused" });
    return;
  }
  audioEl?.pause();
  setPlayback({ status: "paused" });
}

export async function resume(): Promise<void> {
  const track = currentTrack();
  if (!track) return;
  if (state.backend === "native") {
    await native.playerPlay().catch(() => undefined);
    setPlayback({ status: "playing" });
    return;
  }
  if (isVirtual(track)) {
    virtual = { startedAt: performance.now(), offset: state.playback.position };
    setPlayback({ status: "playing" });
    startTicker();
    return;
  }
  const audio = ensureAudio();
  const url = objectUrlFor(track);
  if (!url) {
    handleTrackError(track, "The original file is no longer available.");
    return;
  }
  if (audio.src !== url) audio.src = url;
  try {
    await audio.play();
    setPlayback({ status: "playing" });
    startTicker();
  } catch (err) {
    handleTrackError(track, err instanceof Error ? err.message : "Playback could not be resumed.");
  }
}

export async function stop(): Promise<void> {
  if (state.backend === "native") await native.playerStop().catch(() => undefined);
  audioEl?.pause();
  virtual = null;
  stopTicker();
  setPlayback({ status: "idle", position: 0, trackId: null, queue: [], baseQueue: [], index: -1 });
}

export async function seek(seconds: number): Promise<void> {
  const duration = state.playback.duration;
  const target = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
  if (state.backend === "native") {
    await native.playerSeek(target).catch(() => undefined);
    setPlayback({ position: target });
    return;
  }
  if (virtual) {
    virtual = { startedAt: performance.now(), offset: target };
    setPlayback({ position: target });
    return;
  }
  if (audioEl) {
    audioEl.currentTime = target;
    setPlayback({ position: target });
  }
}

export function setVolume(volume: number) {
  const value = Math.min(1, Math.max(0, volume));
  if (state.backend === "native") void native.playerSetVolume(state.playback.muted ? 0 : value).catch(() => undefined);
  if (audioEl) audioEl.volume = state.playback.muted ? 0 : value;
  setPlayback({ volume: value, muted: value === 0 ? state.playback.muted : false });
}

export function toggleMute() {
  const muted = !state.playback.muted;
  if (audioEl) audioEl.volume = muted ? 0 : state.playback.volume;
  if (state.backend === "native") void native.playerSetVolume(muted ? 0 : state.playback.volume).catch(() => undefined);
  setPlayback({ muted });
}

export function setShuffle(shuffle: boolean) {
  const { playback } = state;
  const base = playback.baseQueue.length ? playback.baseQueue : playback.queue;
  const current = playback.trackId;
  const order = buildQueue(base, shuffle, current, (id) => id);
  setPlayback({
    shuffle,
    queue: order.map((id) => id),
    index: current ? Math.max(0, order.indexOf(current)) : playback.index,
  });
}

export function cycleRepeat() {
  const order: RepeatMode[] = ["off", "all", "one"];
  const index = order.indexOf(state.playback.repeat);
  setPlayback({ repeat: order[(index + 1) % order.length] });
}

export async function next(autoAdvance = false): Promise<void> {
  const { playback } = state;
  if (advancing) return;
  const length = playback.queue.length;
  if (length === 0) return;

  if (playback.repeat === "one" && autoAdvance) {
    await seek(0);
    await resume();
    return;
  }
  const candidate = nextIndex(playback.index, length, playback.repeat, autoAdvance);
  if (candidate === null) {
    setPlayback({ status: "paused", position: playback.duration });
    stopTicker();
    return;
  }
  const id = playback.queue[candidate];
  const track = state.library.tracks[id];
  if (!track) {
    await next(autoAdvance);
    return;
  }
  advancing = true;
  try {
    await startPlayback(track, playback.queue, playback.baseQueue, candidate);
  } finally {
    advancing = false;
  }
}

export async function previous(): Promise<void> {
  const { playback } = state;
  const target = previousIndex(playback.index, playback.position);
  if (target === "restart" || target === null) {
    await seek(0);
    return;
  }
  const id = playback.queue[target];
  const track = state.library.tracks[id];
  if (!track) return;
  await startPlayback(track, playback.queue, playback.baseQueue, target);
}

async function handleEnded() {
  if (state.playback.repeat === "one") {
    await seek(0);
    await resume();
    return;
  }
  await next(true);
}

/* ------------------------------------------------------------------ *
 * Library actions
 * ------------------------------------------------------------------ */

export function setView(view: View) {
  setState({ view });
}

export function setSettings(patch: Partial<Settings>) {
  setState({ settings: { ...state.settings, ...patch } });
}

export function setWidget(patch: Partial<WidgetSettings>) {
  const widget = { ...state.widget, ...patch };
  setState({ widget });
  if (state.backend === "native") {
    if ("alwaysOnTop" in patch) void native.widgetSetAlwaysOnTop(widget.alwaysOnTop).catch(() => undefined);
    if (patch.x !== undefined || patch.y !== undefined || patch.width !== undefined || patch.height !== undefined) {
      void native.widgetSetBounds(widget).catch(() => undefined);
    }
    if ("visible" in patch) {
      void (patch.visible ? native.widgetShow() : native.widgetHide()).catch(() => undefined);
    }
  }
}

export function renameFolder(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const folders = state.library.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f));
  setState({ library: { ...state.library, folders } });
  if (state.backend === "native") void native.renameFolder(id, trimmed).catch(() => undefined);
  toast("success", "Playlist renamed", `The folder on disk is untouched — only the display name changed.`);
}

export function removeFolder(id: string) {
  const folder = state.library.folders.find((f) => f.id === id);
  const tracks = { ...state.library.tracks };
  for (const trackId of folder?.trackIds ?? []) {
    const track = tracks[trackId];
    if (track?.sourceKind !== "loose") delete tracks[trackId];
    else tracks[trackId] = { ...track, folderId: undefined, sourceKind: "loose" };
  }
  setState({
    library: {
      tracks,
      folders: state.library.folders.filter((f) => f.id !== id),
      looseTrackIds: state.library.looseTrackIds,
    },
    view: state.view.name === "playlist" && state.view.id === id ? { name: "home" } : state.view,
  });
  if (state.backend === "native") void native.removeFolder(id).catch(() => undefined);
  toast("success", "Removed from library", "Your music files were not touched.");
}

export function removeTrack(id: string) {
  const tracks = { ...state.library.tracks };
  delete tracks[id];
  const folders = state.library.folders.map((f) =>
    f.trackIds.includes(id) ? { ...f, trackIds: f.trackIds.filter((t) => t !== id) } : f,
  );
  setState({
    library: {
      tracks,
      folders,
      looseTrackIds: state.library.looseTrackIds.filter((t) => t !== id),
    },
    playback:
      state.playback.trackId === id
        ? { ...state.playback, status: "paused", trackId: null, queue: [], baseQueue: [], index: -1 }
        : state.playback,
  });
  if (state.backend === "native") void native.removeTrack(id).catch(() => undefined);
  toast("success", "Entry removed", "The original audio file stays on disk.");
}

export function toggleRecursive(folderId: string) {
  const folders = state.library.folders.map((f) => (f.id === folderId ? { ...f, recursive: !f.recursive } : f));
  setState({ library: { ...state.library, folders } });
  toast(
    "info",
    "Scan policy updated",
    "Nested directories are handled per folder. Refresh the folder to apply it to the existing contents.",
  );
}

export async function refreshFolder(folderId: string) {
  const folder = state.library.folders.find((f) => f.id === folderId);
  if (!folder) return;
  if (state.backend === "native") {
    try {
      await native.refreshFolder(folderId);
      toast("success", "Folder refreshed", folder.name);
      return;
    } catch (err) {
      toast("error", "Refresh failed", err instanceof Error ? err.message : String(err));
      return;
    }
  }
  setState({ busy: { label: `Refreshing ${folder.name}`, processed: 0, total: folder.trackIds.length } });
  for (let i = 0; i < folder.trackIds.length; i++) {
    const track = state.library.tracks[folder.trackIds[i]];
    const file = track ? fileSources.get(track.id) : undefined;
    if (track && file) {
      const duration = await probeDuration(file);
      state.library.tracks[track.id] = { ...track, duration: duration || track.duration, missing: false };
    }
    setState({ busy: { label: `Refreshing ${folder.name}`, processed: i + 1, total: folder.trackIds.length } });
  }
  const folders = state.library.folders.map((f) =>
    f.id === folderId ? { ...f, lastScannedAt: Date.now(), missing: false } : f,
  );
  setState({ library: { ...state.library, folders }, busy: null });
  toast("success", "Folder refreshed", `${folder.trackIds.length} tracks re-read from disk.`);
}

/* ------------------------------------------------------------------ *
 * Import (web preview). The desktop build runs the same flow in Rust —
 * scanning, de-duplication and tag extraction happen off the UI thread.
 * ------------------------------------------------------------------ */

async function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("audio");
    el.preload = "metadata";
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      el.src = "";
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    window.setTimeout(() => done(el.duration), 3500);
    el.src = url;
  });
}

function existingSignatureMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const track of Object.values(state.library.tracks)) {
    map.set(normalizePath(track.path), signatureKey(track.sizeBytes ?? 0, track.duration));
  }
  return map;
}

async function buildTrack(file: File, path: string, folderId?: string): Promise<Track> {
  const key = trackKey(path);
  let title = titleFromFileName(path);
  let artist = artistFromFileName(path);
  let album: string | undefined;
  let artwork: string | undefined;
  try {
    const tags = await readTags(file);
    if (tags.title) title = tags.title;
    if (tags.artist) artist = tags.artist;
    if (tags.album) album = tags.album;
    if (tags.artwork && tags.artwork.length < 4_000_000) {
      artwork = URL.createObjectURL(new Blob([tags.artwork as BlobPart], { type: tags.artworkMime ?? "image/jpeg" }));
    }
  } catch {
    /* unreadable tags are not fatal — the file name is used instead */
  }
  const duration = await probeDuration(file);
  fileSources.set(key, file);
  return {
    id: key,
    title,
    artist,
    album,
    duration,
    path,
    key,
    artwork,
    sourceKind: folderId ? "folder" : "loose",
    folderId,
    sizeBytes: file.size,
  };
}

export async function importFolder(): Promise<void> {
  if (state.backend === "native") {
    try {
      const path = await native.pickFolder();
      if (!path) return;
      setState({ busy: { label: "Scanning folder", processed: 0, total: 0 } });
      await native.importFolder(path, state.settings.recursiveScan);
      setState({ busy: null });
      toast("success", "Folder imported", path);
    } catch (err) {
      setState({ busy: null });
      toast("error", "Import failed", err instanceof Error ? err.message : String(err));
    }
    return;
  }

  const picked = await pickFolderFiles();
  const audioFiles = picked.filter((p) => isAudioFile(p.file.name));
  if (audioFiles.length === 0) {
    toast("info", "No audio files found", "Vesper reads MP3, WAV, FLAC, M4A/AAC, OGG and Opus files.");
    return;
  }
  const { folder } = folderFromRelativePath(audioFiles[0].relativePath);
  const recursive = state.settings.recursiveScan;
  const candidates = audioFiles.map((p) => ({
    relativePath: p.relativePath,
    name: p.file.name,
    sizeBytes: p.file.size,
    file: p.file,
  }));
  // Nested-directory policy + de-duplication live in `lib/import-policy` and are
  // covered by `tests/library.test.ts`.
  const scoped = selectImportableFiles(candidates, recursive);
  const plan = planImport(existingSignatureMap(), scoped);

  const folderId = `folder-${trackKey(folder + Date.now())}`;
  const trackIds: string[] = [];
  let duplicates = plan.skipped.length;

  setState({ busy: { label: `Importing ${folder}`, processed: 0, total: plan.add.length } });

  for (let i = 0; i < plan.add.length; i++) {
    const entry = plan.add[i];
    const path = entry.relativePath.replace(/\//g, "\\");
    const key = trackKey(path);
    const track = await buildTrack(entry.file, path, folderId);
    state.library.tracks[key] = track;
    trackIds.push(key);
    if (i % 6 === 5 || i === plan.add.length - 1) {
      setState({
        library: { ...state.library, tracks: { ...state.library.tracks } },
        busy: { label: `Importing ${folder}`, processed: i + 1, total: plan.add.length },
      });
    }
  }

  const playlist: FolderPlaylist = {
    id: folderId,
    name: folder || "Imported folder",
    path: `C:\\Music\\${folder}`,
    trackIds,
    recursive,
    missing: false,
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
  };
  setState({
    library: {
      tracks: { ...state.library.tracks },
      folders: [...state.library.folders, playlist],
      looseTrackIds: state.library.looseTrackIds,
    },
    busy: null,
    view: { name: "playlist", id: folderId },
    settings: { ...state.settings, lastPlaylistId: folderId },
  });
  toast(
    "success",
    "Folder imported",
    `${trackIds.length} tracks added as “${playlist.name}”.${duplicates ? ` ${duplicates} duplicate(s) skipped.` : ""}`,
  );
}

export async function importTracks(): Promise<void> {
  if (state.backend === "native") {
    try {
      const paths = await native.pickTracks();
      if (paths.length === 0) return;
      setState({ busy: { label: "Importing tracks", processed: 0, total: paths.length } });
      await native.importTracks(paths);
      setState({ busy: null });
      toast("success", "Tracks imported", `${paths.length} file(s) added to your library.`);
    } catch (err) {
      setState({ busy: null });
      toast("error", "Import failed", err instanceof Error ? err.message : String(err));
    }
    return;
  }

  const files = (await pickTrackFiles()).filter((f) => isAudioFile(f.name));
  if (files.length === 0) {
    toast("info", "No audio files selected", "Select one or more MP3, WAV, FLAC, M4A/AAC or OGG files.");
    return;
  }
  const loose = [...state.library.looseTrackIds];
  let added = 0;
  let duplicates = 0;
  setState({ busy: { label: "Importing tracks", processed: 0, total: files.length } });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const key = trackKey(file.name + file.size);
    if (state.library.tracks[key]) {
      duplicates += 1;
      continue;
    }
    // Note: only the selected files are added. The parent folder is never scanned.
    const track = await buildTrack(file, file.name);
    track.sourceKind = "loose";
    state.library.tracks[key] = track;
    loose.push(key);
    added += 1;
    setState({
      library: { ...state.library, tracks: { ...state.library.tracks }, looseTrackIds: [...loose] },
      busy: { label: "Importing tracks", processed: i + 1, total: files.length },
    });
  }

  setState({ busy: null, view: { name: "home" } });
  toast(
    "success",
    added ? "Tracks imported" : "Nothing to add",
    added
      ? `${added} track(s) added individually.${duplicates ? ` ${duplicates} duplicate(s) skipped.` : ""}`
      : `${duplicates} file(s) were already in your library.`,
  );
}

export function clearSampleCollection() {
  const library = state.library;
  const tracks = { ...library.tracks };
  const ids = new Set<string>();
  for (const folder of library.folders.filter((f) => f.sample)) folder.trackIds.forEach((id) => ids.add(id));
  library.looseTrackIds.filter((id) => tracks[id]?.sourceKind === "sample").forEach((id) => ids.add(id));
  ids.forEach((id) => delete tracks[id]);
  setState({
    library: {
      tracks,
      folders: library.folders.filter((f) => !f.sample),
      looseTrackIds: library.looseTrackIds.filter((id) => !ids.has(id)),
    },
    settings: { ...state.settings, showSampleCollection: false },
    view: { name: "home" },
  });
  toast("success", "Sample collection removed", "Only your own imported music remains.");
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

let bootstrapped = false;

export async function init(widgetWindow = false) {
  isWidgetWindow = widgetWindow;
  if (bootstrapped) return;
  bootstrapped = true;

  const snapshot = await loadSnapshot();
  applySnapshot(snapshot);

  if (!snapshot) {
    const sample = buildSampleLibrary();
    setState({ library: sample, ready: true });
  } else {
    setState({ ready: true });
  }

  // Restore the session in a *paused* state so both windows open showing real
  // artwork and metadata rather than an empty shell. Nothing plays until asked.
  if (!state.playback.trackId) {
    const firstFolder = state.library.folders[0];
    const firstId = firstFolder?.trackIds[0] ?? state.library.looseTrackIds[0];
    const track = firstId ? state.library.tracks[firstId] : null;
    if (track) {
      const queue = firstFolder ? [...firstFolder.trackIds] : [track.id];
      setPlayback({
        trackId: track.id,
        queue,
        baseQueue: queue,
        index: Math.max(0, queue.indexOf(track.id)),
        position: 0,
        duration: track.duration,
        status: "paused",
      });
    }
  }

  if (state.backend === "native") {
    void events.playbackState((patch) => {
      setPlayback(patch);
    });
    void events.libraryChanged(() => {
      void loadSnapshot().then((next) => {
        if (next) applySnapshot(next);
      });
    });
    if (state.playback.trackId) {
      const track = state.library.tracks[state.playback.trackId];
      if (track) {
        await startPlayback(track, [track.id], [track.id], 0);
        await seek(snapshot?.playback.position ?? 0);
        await pause();
      }
    }
    return;
  }

  channelSync = openStateChannel((message) => {
    if (!isWidgetWindow) return;
    const patch: Partial<AppState> = {
      playback: { ...state.playback, ...message.playback } as PlaybackState,
    };
    if (message.widget) patch.widget = message.widget;
    if (message.track) {
      patch.library = {
        ...state.library,
        tracks: { ...state.library.tracks, [message.track.id]: message.track },
      };
    }
    setState(patch);
  });
}

export function isWidgetContext(): boolean {
  return isWidgetWindow;
}

export const selectors = {
  trackById: (id: string | null): Track | null => (id ? (state.library.tracks[id] ?? null) : null),
  folderById: (id: string): FolderPlaylist | null => state.library.folders.find((f) => f.id === id) ?? null,
  folderTracks: (folder: FolderPlaylist): Track[] =>
    folder.trackIds.map((id) => state.library.tracks[id]).filter(Boolean),
  looseTracks: (): Track[] => state.library.looseTrackIds.map((id) => state.library.tracks[id]).filter(Boolean),
  totalTracks: (): number => Object.keys(state.library.tracks).length,
  artworkFor: (track: Track | null): string => track?.artwork ?? FALLBACK_ART,
};
