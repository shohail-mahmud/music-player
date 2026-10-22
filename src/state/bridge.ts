/**
 * Typed boundary between the UI and the native (Tauri 2 / Rust) core.
 *
 * In the desktop build every call is a real Tauri command handled in
 * `src-tauri/src/commands.rs`. In the browser preview the same interface is
 * backed by the File System Access / file pickers, `localStorage` and the
 * HTML5 audio engine — so the interface you see is genuinely interactive.
 *
 * The global `__TAURI_INTERNALS__` / `__TAURI__` bridges are used directly so
 * the web bundle never has to resolve `@tauri-apps/api` at build time. The
 * equivalent idiomatic imports are:
 *   import { invoke } from "@tauri-apps/api/core";
 *   import { listen } from "@tauri-apps/api/event";
 */

import type { AppSnapshot, PlaybackState, WidgetSettings } from "../types";

type Unlisten = () => void;

export const runtime = {
  get isTauri(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  },
};

export class NativeUnavailableError extends Error {
  constructor(command: string) {
    super(`Native command "${command}" is unavailable outside the Tauri runtime`);
    this.name = "NativeUnavailableError";
  }
}

export async function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as any).__TAURI_INTERNALS__;
  if (!internals?.invoke) throw new NativeUnavailableError(command);
  return internals.invoke(command, args) as Promise<T>;
}

export async function nativeListen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
  const tauri = (window as any).__TAURI__;
  if (tauri?.event?.listen) {
    const un = await tauri.event.listen(event, (e: { payload: T }) => handler(e.payload));
    return () => {
      void un;
    };
  }
  return () => {};
}

/* ------------------------------------------------------------------ *
 * Command surface (mirrors src-tauri/src/commands.rs)
 * ------------------------------------------------------------------ */

export interface NativeApi {
  snapshotLoad(): Promise<AppSnapshot | null>;
  snapshotSave(snapshot: AppSnapshot): Promise<void>;
  pickFolder(): Promise<string | null>;
  pickTracks(): Promise<string[]>;
  importFolder(path: string, recursive: boolean): Promise<unknown>;
  importTracks(paths: string[]): Promise<unknown>;
  refreshFolder(id: string): Promise<unknown>;
  removeFolder(id: string): Promise<void>;
  removeTrack(id: string): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  playerLoad(path: string, startAt: number): Promise<void>;
  playerPlay(): Promise<void>;
  playerPause(): Promise<void>;
  playerSeek(seconds: number): Promise<void>;
  playerSetVolume(volume: number): Promise<void>;
  playerStop(): Promise<void>;
  widgetShow(): Promise<void>;
  widgetHide(): Promise<void>;
  widgetSetAlwaysOnTop(value: boolean): Promise<void>;
  widgetSetBounds(settings: WidgetSettings): Promise<void>;
  openPath(path: string): Promise<void>;
}

export const native: NativeApi = {
  snapshotLoad: () => nativeInvoke("snapshot_load"),
  snapshotSave: (snapshot) => nativeInvoke("snapshot_save", { snapshot }),
  pickFolder: () => nativeInvoke<string | null>("pick_folder"),
  pickTracks: () => nativeInvoke<string[]>("pick_tracks"),
  importFolder: (path, recursive) => nativeInvoke("import_folder", { path, recursive }),
  importTracks: (paths) => nativeInvoke("import_tracks", { paths }),
  refreshFolder: (id) => nativeInvoke("refresh_folder", { id }),
  removeFolder: (id) => nativeInvoke("remove_folder", { id }),
  removeTrack: (id) => nativeInvoke("remove_track", { id }),
  renameFolder: (id, name) => nativeInvoke("rename_folder", { id, name }),
  playerLoad: (path, startAt) => nativeInvoke("player_load", { path, startAt }),
  playerPlay: () => nativeInvoke("player_play"),
  playerPause: () => nativeInvoke("player_pause"),
  playerSeek: (seconds) => nativeInvoke("player_seek", { seconds }),
  playerSetVolume: (volume) => nativeInvoke("player_set_volume", { volume }),
  playerStop: () => nativeInvoke("player_stop"),
  widgetShow: () => nativeInvoke("widget_show"),
  widgetHide: () => nativeInvoke("widget_hide"),
  widgetSetAlwaysOnTop: (value) => nativeInvoke("widget_set_always_on_top", { value }),
  widgetSetBounds: (settings) => nativeInvoke("widget_set_bounds", { settings }),
  openPath: (path) => nativeInvoke("open_path", { path }),
};

export const events = {
  playbackState: (cb: (state: Partial<PlaybackState>) => void): Promise<Unlisten> =>
    nativeListen("playback://state", cb),
  libraryChanged: (cb: () => void): Promise<Unlisten> => nativeListen("library://changed", cb),
};

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

const LS_SNAPSHOT = "vesper.snapshot.v1";

export async function loadSnapshot(): Promise<AppSnapshot | null> {
  if (runtime.isTauri) {
    try {
      return await native.snapshotLoad();
    } catch (err) {
      console.warn("[vesper] native snapshot load failed, falling back to local cache", err);
    }
  }
  try {
    const raw = localStorage.getItem(LS_SNAPSHOT);
    return raw ? (JSON.parse(raw) as AppSnapshot) : null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(snapshot: AppSnapshot): Promise<void> {
  try {
    localStorage.setItem(LS_SNAPSHOT, JSON.stringify(snapshot));
  } catch {
    /* quota or private mode — the native database remains authoritative */
  }
  if (runtime.isTauri) {
    try {
      await native.snapshotSave(snapshot);
    } catch (err) {
      console.warn("[vesper] native snapshot save failed", err);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Cross-window sync for the browser preview.
 * The desktop build uses Tauri events broadcast by the Rust playback service;
 * this mirrors that behaviour when the widget is opened as a second tab.
 * ------------------------------------------------------------------ */

const CHANNEL = "vesper://state";

export interface StateChannelMessage {
  playback: Partial<PlaybackState>;
  widget: WidgetSettings;
  track: import("../types").Track | null;
}

export function openStateChannel(onReceive: (message: StateChannelMessage) => void): {
  post: (message: StateChannelMessage) => void;
  close: Unlisten;
} {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, close: () => {} };
  }
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => onReceive(event.data);
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}

/* ------------------------------------------------------------------ *
 * File pickers (browser preview)
 * ------------------------------------------------------------------ */

export interface PickedFile {
  file: File;
  relativePath: string;
}

function inputToFileList(accept: string, multiple: boolean, directory: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    if (directory) {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    window.addEventListener(
      "focus",
      () => {
        // picker dismissed without a selection
        window.setTimeout(() => finish(Array.from(input.files ?? [])), 600);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickFolderFiles(): Promise<PickedFile[]> {
  const files = await inputToFileList("audio/*", true, true);
  return files.map((file) => ({
    file,
    relativePath: (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

export async function pickTrackFiles(): Promise<File[]> {
  return inputToFileList("audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus", true, false);
}
