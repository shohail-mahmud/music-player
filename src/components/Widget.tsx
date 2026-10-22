import { useCallback, useEffect, useRef, useState } from "react";
import {
  cycleRepeat,
  next,
  previous,
  seek,
  selectors,
  setShuffle,
  setVolume,
  setWidget,
  togglePlay,
  useApp,
} from "../state/store";
import { formatTime, percent } from "../lib/format";
import * as I from "./Icons";

/* ------------------------------------------------------------------ *
 * Seek bar (shared visual language with the main playback bar)
 * ------------------------------------------------------------------ */

export function SeekBar({
  value,
  duration,
  onSeek,
  accent = "#A9A2FF",
  track = "rgba(255,255,255,0.16)",
  height = 3,
  label,
}: {
  value: number;
  duration: number;
  onSeek: (seconds: number) => void;
  accent?: string;
  track?: string;
  height?: number;
  label: string;
}) {
  const pct = percent(value, duration);
  return (
    <input
      type="range"
      className="vesper-range"
      min={0}
      max={Math.max(1, Math.round(duration) || 1)}
      step={1}
      value={Math.round(value)}
      aria-label={label}
      onChange={(e) => onSeek(Number(e.target.value))}
      style={
        {
          "--track-h": `${height}px`,
          "--track-bg": `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, ${track} ${pct}%, ${track} 100%)`,
          "--thumb-bg": accent,
        } as React.CSSProperties
      }
    />
  );
}

function Equalizer({ active }: { active: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={active ? "eq-bar w-[2px] rounded-full bg-[#A9A2FF]" : "w-[2px] rounded-full bg-white/25"}
          style={{ height: "100%", animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * The widget itself. Mounted in its own Tauri window (`?window=widget`)
 * and, in the browser preview, floating over the desktop scene.
 * ------------------------------------------------------------------ */

export function Widget({
  mode,
  onToggleSize,
}: {
  mode: "desktop" | "window";
  onToggleSize?: () => void;
}) {
  const state = useApp();
  const { widget, playback } = state;
  const track = selectors.trackById(playback.trackId);
  const art = selectors.artworkFor(track);
  const playing = playback.status === "playing";
  const compact = widget.size === "compact";
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [artReady, setArtReady] = useState(false);

  useEffect(() => setArtReady(false), [art]);

  const beginDrag = useCallback(
    (event: React.PointerEvent) => {
      const tauriWindow = (window as any).__TAURI__?.window?.getCurrentWindow?.();
      if (tauriWindow?.startDragging) {
        event.preventDefault();
        void tauriWindow.startDragging();
        return;
      }
      if (mode !== "desktop") return;
      const target = event.target as HTMLElement | null;
      // Controls stay clickable: only the glass surface itself starts a drag.
      if (target?.closest("button, input, a, [role='switch']")) return;
      event.preventDefault();
      dragRef.current = { x: event.clientX, y: event.clientY, ox: widget.x, oy: widget.y };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    },
    [mode, widget.x, widget.y],
  );

  const beginResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = { x: event.clientX, y: event.clientY, w: widget.width, h: widget.height };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    },
    [widget.width, widget.height],
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragRef.current) {
        const d = dragRef.current;
        setWidget({
          x: d.ox + (event.clientX - d.x),
          y: d.oy + (event.clientY - d.y),
        });
      }
      if (resizeRef.current) {
        const r = resizeRef.current;
        setWidget({
          width: Math.min(560, Math.max(compact ? 260 : 300, r.w + (event.clientX - r.x))),
          height: Math.min(340, Math.max(compact ? 88 : 150, r.h + (event.clientY - r.y))),
        });
      }
    };
    const up = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [compact]);

  const hide = () => setWidget({ visible: false });

  return (
    <div
      className="glass group relative flex select-none flex-col overflow-hidden rounded-[22px] border border-white/12 text-white"
      style={{
        width: mode === "window" ? "100%" : widget.width,
        height: mode === "window" ? "100%" : widget.height,
        opacity: widget.opacity,
        backdropFilter: "blur(30px) saturate(160%)",
      }}
      onPointerDown={beginDrag}
      onDoubleClick={onToggleSize}
    >
      {/* readability scrim — keeps white type legible over bright wallpapers */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.10),rgba(255,255,255,0)_42%),linear-gradient(0deg,rgba(12,11,20,0.34),rgba(12,11,20,0.34))]" />

      <div className="relative flex min-h-0 flex-1 gap-3.5 p-3.5">
        {widget.showArtwork && (
          <div
            className="relative shrink-0 overflow-hidden rounded-[15px] bg-white/8 shadow-[0_10px_28px_rgba(0,0,0,0.36)]"
            style={{ width: compact ? 52 : 84, height: compact ? 52 : 84 }}
          >
            <img
              src={art}
              alt={track?.album ? `Artwork for ${track.album}` : "Album artwork"}
              className="h-full w-full object-cover"
              style={{ opacity: artReady ? 1 : 0, transition: "opacity 320ms ease" }}
              onLoad={() => setArtReady(true)}
              draggable={false}
            />
            <div className="pointer-events-none absolute inset-0 rounded-[15px] ring-1 ring-inset ring-white/12" />
            {playing && (
              <div className="absolute bottom-2 left-2">
                <Equalizer active />
              </div>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div
                className="truncate-1 font-display text-[15px] leading-tight font-medium text-white"
                title={track?.title ?? "Nothing playing"}
              >
                {track?.title ?? "Nothing playing"}
              </div>
              <div
                className="truncate-1 mt-[3px] text-[11.5px] leading-tight text-white/72"
                title={track?.artist ?? (track ? "Unknown artist" : "Import a folder to begin")}
              >
                {track?.artist ?? (track ? "Unknown artist" : "Import a folder to begin")}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
              <button
                className={`icon-btn h-7 w-7 text-white/70 hover:bg-white/12 hover:text-white ${widget.alwaysOnTop ? "bg-white/14 text-white" : ""}`}
                onClick={() => setWidget({ alwaysOnTop: !widget.alwaysOnTop })}
                title={widget.alwaysOnTop ? "Unpin from top" : "Keep on top"}
                aria-pressed={widget.alwaysOnTop}
              >
                <I.Pin size={14} />
              </button>
              <button
                className="icon-btn h-7 w-7 text-white/70 hover:bg-white/12 hover:text-white"
                onClick={onToggleSize}
                title={compact ? "Expanded widget" : "Compact widget"}
              >
                <I.Panel size={14} />
              </button>
              <button
                className="icon-btn h-7 w-7 text-white/70 hover:bg-white/12 hover:text-white"
                onClick={hide}
                title="Hide widget (music keeps playing)"
              >
                <I.EyeOff size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1" />

          {widget.showProgress && (
            <div className="mb-1.5">
              <SeekBar
                value={playback.position}
                duration={playback.duration || track?.duration || 0}
                onSeek={seek}
                label="Playback position"
              />
              <div className="mt-1 flex items-center justify-between text-white/65">
                <span className="tnum text-[10px]">{formatTime(playback.position)}</span>
                <span className="tnum text-[10px]">
                  {formatTime(playback.duration || track?.duration || 0)}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {!compact && (
              <button
                className={`icon-btn h-7 w-7 ${playback.shuffle ? "text-[#A9A2FF]" : "text-white/55"} hover:bg-white/12 hover:text-white`}
                onClick={() => setShuffle(!playback.shuffle)}
                title="Shuffle"
                aria-pressed={playback.shuffle}
              >
                <I.Shuffle size={15} />
              </button>
            )}
            <button
              className="icon-btn h-8 w-8 text-white/88 hover:bg-white/12 hover:text-white"
              onClick={() => void previous()}
              title="Previous track"
            >
              <I.Prev size={17} />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#17161C] shadow-[0_6px_18px_rgba(0,0,0,0.34)] transition-transform duration-150 hover:scale-[1.05] active:scale-95"
              onClick={() => void togglePlay()}
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <I.Pause size={17} /> : <I.Play size={17} className="translate-x-[1px]" />}
            </button>
            <button
              className="icon-btn h-8 w-8 text-white/88 hover:bg-white/12 hover:text-white"
              onClick={() => void next()}
              title="Next track"
            >
              <I.Next size={17} />
            </button>
            {!compact && (
              <button
                className={`icon-btn h-7 w-7 ${playback.repeat !== "off" ? "text-[#A9A2FF]" : "text-white/55"} hover:bg-white/12 hover:text-white`}
                onClick={cycleRepeat}
                title={`Repeat: ${playback.repeat}`}
                aria-pressed={playback.repeat !== "off"}
              >
                {playback.repeat === "one" ? <I.RepeatOne size={15} /> : <I.Repeat size={15} />}
              </button>
            )}
            <div className="flex-1" />
            {!compact && widget.showVolume && (
              <div className="flex w-[86px] items-center gap-1.5">
                <span className="text-white/55">
                  {playback.muted ? <I.VolumeMute size={14} /> : <I.Volume size={14} />}
                </span>
                <SeekBar
                  value={playback.muted ? 0 : playback.volume * 100}
                  duration={100}
                  onSeek={(v) => setVolume(v / 100)}
                  accent="#FFFFFF"
                  height={2}
                  label="Volume"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {mode === "desktop" && (
        <div
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100"
          onPointerDown={beginResize}
          title="Resize widget"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-white/45">
            <path d="M13 3 3 13M13 8l-5 5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Widget window entry — mounted when the URL is `?window=widget`.
 * In the desktop build this is a real, undecorated, transparent Tauri
 * window; in the preview it is rendered full-bleed for inspection.
 * ------------------------------------------------------------------ */

export function WidgetWindow() {
  const state = useApp();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(id);
  }, []);

  if (!state.ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="glass h-[188px] w-[384px] rounded-[22px] border border-white/12" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-transparent p-3">
      <div className={ready ? "rise h-full w-full" : "h-full w-full"}>
        <Widget mode="window" />
      </div>
    </div>
  );
}
