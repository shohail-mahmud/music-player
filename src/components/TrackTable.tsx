import { useState } from "react";
import type { Track } from "../types";
import { formatTime } from "../lib/format";
import * as I from "./Icons";

export function PlayingBadge({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={playing ? "eq-bar w-[2px] rounded-full bg-accent" : "w-[2px] rounded-full bg-accent/45"}
          style={{ height: "100%", animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

export function TrackTable({
  tracks,
  currentId,
  onPlay,
  onRemove,
  showAlbum = true,
  emptyState,
  startIndex = 1,
}: {
  tracks: Track[];
  currentId: string | null;
  onPlay: (index: number, track: Track) => void;
  onRemove?: (track: Track) => void;
  showAlbum?: boolean;
  emptyState?: React.ReactNode;
  startIndex?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (tracks.length === 0) {
    return (
      <div className="border-t border-rule py-12 text-center">
        {emptyState ?? <p className="text-[13px] text-ink-2">No tracks here yet.</p>}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="plate flex items-center gap-4 border-b border-rule pb-2 text-ink-3">
        <span className="w-7 text-right">#</span>
        <span className="flex-1">Title</span>
        {showAlbum && <span className="hidden w-52 lg:block">Album</span>}
        <span className="w-14 text-right">Time</span>
        <span className="w-8" />
      </div>

      <ul role="list">
        {tracks.map((track, index) => {
          const active = track.id === currentId;
          return (
            <li
              key={track.id + index}
              className="row-focus group border-b border-rule-soft transition-colors duration-150 hover:bg-white/70 focus-within:bg-white/70"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-4 py-2.5">
                <button
                  className="w-7 shrink-0 text-right"
                  onClick={() => onPlay(index, track)}
                  title={`Play ${track.title}`}
                  aria-label={`Play ${track.title}`}
                >
                  <span
                    className={`tnum text-[12px] ${active ? "text-accent" : "text-ink-3"} group-hover:hidden`}
                  >
                    {active ? <PlayingBadge playing /> : String(index + startIndex).padStart(2, "0")}
                  </span>
                  <span className="hidden text-ink group-hover:block">
                    <I.Play size={13} />
                  </span>
                </button>

                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onPlay(index, track)}
                  title={track.title}
                >
                  <div
                    className={`truncate-1 text-[13.5px] leading-tight ${active ? "text-accent" : "text-ink"}`}
                  >
                    {track.title}
                  </div>
                  <div className="truncate-1 mt-0.5 text-[11.5px] leading-tight text-ink-2">
                    {track.artist ?? "Unknown artist"}
                    {track.missing && (
                      <span className="ml-2 rounded-full bg-[#B4453A]/10 px-2 py-[1px] text-[10px] text-[#B4453A]">
                        file missing
                      </span>
                    )}
                  </div>
                </button>

                {showAlbum && (
                  <div className="hidden w-52 truncate-1 text-[12px] text-ink-2 lg:block">
                    {track.album ?? "—"}
                  </div>
                )}

                <div className="tnum w-14 text-right text-[12px] text-ink-2">
                  {formatTime(track.duration)}
                </div>

                <div className="flex w-8 justify-end">
                  {onRemove && hovered === index ? (
                    <button
                      className="icon-btn h-7 w-7"
                      onClick={() => onRemove(track)}
                      title="Remove from library (the file stays on disk)"
                      aria-label={`Remove ${track.title} from library`}
                    >
                      <I.X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
