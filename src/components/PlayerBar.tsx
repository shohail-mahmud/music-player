import {
  cycleRepeat,
  next,
  previous,
  seek,
  selectors,
  setShuffle,
  setVolume,
  setWidget,
  toggleMute,
  togglePlay,
  useApp,
} from "../state/store";
import { formatTime } from "../lib/format";
import { SeekBar } from "./Widget";
import * as I from "./Icons";

export function PlayerBar() {
  const state = useApp();
  const { playback, widget } = state;
  const track = selectors.trackById(playback.trackId);
  const art = selectors.artworkFor(track);
  const playing = playback.status === "playing";
  const duration = playback.duration || track?.duration || 0;

  return (
    <div className="mica relative z-20 shrink-0 border-t border-rule">
      <div className="px-5 pt-2 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-[1.2] items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] bg-rule/60">
              <img src={art} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            <div className="min-w-0">
              <div className="truncate-1 text-[13px] leading-tight text-ink" title={track?.title}>
                {track?.title ?? "Nothing playing"}
              </div>
              <div className="truncate-1 mt-0.5 text-[11.5px] leading-tight text-ink-2">
                {track?.artist ?? (track ? "Unknown artist" : "Choose a track to start listening")}
              </div>
            </div>
          </div>

          <div className="flex flex-[1.6] flex-col items-center gap-1.5">
            <div className="flex items-center gap-2.5">
              <button
                className={`icon-btn h-8 w-8 ${playback.shuffle ? "text-accent" : ""}`}
                onClick={() => setShuffle(!playback.shuffle)}
                title="Shuffle"
                aria-pressed={playback.shuffle}
              >
                <I.Shuffle size={16} />
              </button>
              <button className="icon-btn h-8 w-8" onClick={() => void previous()} title="Previous (Left arrow)">
                <I.Prev size={17} />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-paper transition-transform duration-150 hover:scale-[1.05] active:scale-95"
                onClick={() => void togglePlay()}
                title={playing ? "Pause (Space)" : "Play (Space)"}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <I.Pause size={18} /> : <I.Play size={18} className="translate-x-[1px]" />}
              </button>
              <button className="icon-btn h-8 w-8" onClick={() => void next()} title="Next (Right arrow)">
                <I.Next size={17} />
              </button>
              <button
                className={`icon-btn h-8 w-8 ${playback.repeat !== "off" ? "text-accent" : ""}`}
                onClick={cycleRepeat}
                title={`Repeat: ${playback.repeat}`}
                aria-pressed={playback.repeat !== "off"}
              >
                {playback.repeat === "one" ? <I.RepeatOne size={16} /> : <I.Repeat size={16} />}
              </button>
            </div>

            <div className="flex w-full max-w-[460px] items-center gap-2.5">
              <span className="tnum w-9 text-right text-[10.5px] text-ink-2">{formatTime(playback.position)}</span>
              <div className="flex-1">
                <SeekBar
                  value={playback.position}
                  duration={duration}
                  onSeek={seek}
                  accent="#5A52D6"
                  track="rgba(23,22,28,0.14)"
                  label="Playback position"
                />
              </div>
              <span className="tnum w-9 text-[10.5px] text-ink-2">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex flex-[1.2] items-center justify-end gap-2">
            <button
              className={`icon-btn h-8 w-8 ${widget.visible ? "text-accent" : ""}`}
              onClick={() => setWidget({ visible: !widget.visible })}
              title={widget.visible ? "Hide desktop widget" : "Show desktop widget"}
              aria-pressed={widget.visible}
            >
              {widget.visible ? <I.Panel size={17} /> : <I.EyeOff size={17} />}
            </button>
            <button className="icon-btn h-8 w-8" onClick={toggleMute} title="Mute">
              {playback.muted ? <I.VolumeMute size={17} /> : <I.Volume size={17} />}
            </button>
            <div className="w-[92px]">
              <SeekBar
                value={playback.muted ? 0 : playback.volume * 100}
                duration={100}
                onSeek={(v) => setVolume(v / 100)}
                accent="#5A52D6"
                track="rgba(23,22,28,0.14)"
                height={3}
                label="Volume"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
