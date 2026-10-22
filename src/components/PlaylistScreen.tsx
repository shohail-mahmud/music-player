import { useState } from "react";
import {
  playFromList,
  refreshFolder,
  removeFolder,
  renameFolder,
  selectors,
  setView,
  toggleRecursive,
  useApp,
} from "../state/store";
import { formatCount, formatDate, formatDurationTotal } from "../lib/format";
import { TrackTable } from "./TrackTable";
import * as I from "./Icons";

export function PlaylistScreen({ folderId }: { folderId: string }) {
  const state = useApp();
  const folder = selectors.folderById(folderId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder?.name ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  if (!folder) {
    return (
      <div className="fade px-10 py-20 text-center">
        <h2 className="font-display text-[26px] text-ink">This playlist is no longer in your library</h2>
        <button className="btn btn-ghost mt-5" onClick={() => setView({ name: "home" })}>
          <I.ArrowLeft size={14} /> Back to library
        </button>
      </div>
    );
  }

  const tracks = selectors.folderTracks(folder);
  const duration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const missing = tracks.filter((t) => t.missing).length;

  const commitRename = () => {
    if (draft.trim()) renameFolder(folder.id, draft);
    else setDraft(folder.name);
    setEditing(false);
  };

  return (
    <div className="fade px-10 pt-8 pb-12">
      <button
        className="plate flex items-center gap-2 text-ink-3 transition-colors hover:text-ink"
        onClick={() => setView({ name: "home" })}
      >
        <I.ArrowLeft size={13} /> Library
      </button>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-8">
        <div className="min-w-0">
          <div className="plate mb-3 flex items-center gap-3 text-ink-3">
            <span>Folder playlist</span>
            <span className="h-[1px] w-8 bg-rule" />
            <span className="tnum">{folder.recursive ? "Recursive scan" : "Top level scan"}</span>
          </div>

          {editing ? (
            <input
              autoFocus
              className="font-display w-full max-w-[560px] border-b border-accent bg-transparent text-[clamp(2rem,3.8vw,3.1rem)] leading-[1.02] font-light tracking-[-0.022em] text-ink outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraft(folder.name);
                  setEditing(false);
                }
              }}
              aria-label="Playlist display name"
            />
          ) : (
            <h1
              className="font-display cursor-text text-[clamp(2rem,3.8vw,3.1rem)] leading-[1.02] font-light tracking-[-0.022em] text-ink"
              onClick={() => {
                setDraft(folder.name);
                setEditing(true);
              }}
              title="Click to rename this playlist (the folder on disk is never renamed)"
            >
              {folder.name}
            </h1>
          )}

          <div className="tnum mt-3 truncate-1 text-[11px] text-ink-3">{folder.path}</div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-[12px] text-ink-2">{formatCount(tracks.length, "track")}</span>
            <span className="h-[1px] w-4 bg-rule" />
            <span className="text-[12px] text-ink-2">{formatDurationTotal(duration)}</span>
            <span className="h-[1px] w-4 bg-rule" />
            <span className="text-[12px] text-ink-2">Added {formatDate(folder.addedAt)}</span>
            {folder.lastScannedAt && (
              <>
                <span className="h-[1px] w-4 bg-rule" />
                <span className="text-[12px] text-ink-2">Scanned {formatDate(folder.lastScannedAt)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button className="btn btn-primary" onClick={() => void playFromList(tracks, 0, false)}>
            <I.Play size={14} /> Play All
          </button>
          <button className="btn btn-accent" onClick={() => void playFromList(tracks, 0, true)}>
            <I.Shuffle size={14} /> Shuffle
          </button>
          <div className="relative">
            <button
              className="btn btn-ghost"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <I.More size={14} /> Manage
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-[10px] border border-rule bg-white shadow-[0_18px_46px_rgba(43,38,74,0.18)]"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {[
                  {
                    icon: <I.Refresh size={14} />,
                    label: "Refresh folder contents",
                    action: () => void refreshFolder(folder.id),
                  },
                  {
                    icon: <I.Folder size={14} />,
                    label: folder.recursive ? "Scan nested folders: on" : "Scan nested folders: off",
                    action: () => toggleRecursive(folder.id),
                  },
                  {
                    icon: <I.Sparkle size={14} />,
                    label: "Rename playlist",
                    action: () => {
                      setDraft(folder.name);
                      setEditing(true);
                    },
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] text-ink transition-colors hover:bg-paper"
                    onClick={() => {
                      item.action();
                      setMenuOpen(false);
                    }}
                  >
                    <span className="text-ink-2">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-3 border-t border-rule px-4 py-2.5 text-left text-[12px] text-[#B4453A] transition-colors hover:bg-[#B4453A]/8"
                  onClick={() => {
                    removeFolder(folder.id);
                    setMenuOpen(false);
                  }}
                >
                  <I.Trash size={14} /> Remove from library
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {(folder.missing || missing > 0) && (
        <div className="mt-7 flex items-start gap-3 rounded-[10px] border border-[#B4453A]/25 bg-[#B4453A]/6 px-5 py-4">
          <span className="mt-[2px] text-[#B4453A]">
            <I.Warning size={16} />
          </span>
          <div>
            <h3 className="text-[12.5px] font-medium text-ink">
              {folder.missing ? "This folder is currently unavailable" : `${missing} track(s) could not be found`}
            </h3>
            <p className="mt-1 max-w-[64ch] text-[11.5px] leading-relaxed text-ink-2">
              The playlist is kept exactly as it was — nothing was deleted. Reconnect the drive or
              restore the folder to its original location, then choose{" "}
              <em className="text-ink">Refresh folder contents</em>.
            </p>
            <button className="btn btn-ghost mt-3 py-1.5 text-[11.5px]" onClick={() => void refreshFolder(folder.id)}>
              <I.Refresh size={13} /> Try again
            </button>
          </div>
        </div>
      )}

      <section className="mt-10">
        <TrackTable
          tracks={tracks}
          currentId={state.playback.trackId}
          onPlay={(index) => void playFromList(tracks, index, state.playback.shuffle)}
          emptyState={
            <div className="py-10 text-center">
              <p className="text-[13px] text-ink-2">
                No audio files in this folder{folder.recursive ? "" : " at the top level"}.
              </p>
              <button
                className="btn btn-ghost mt-4"
                onClick={() => toggleRecursive(folder.id)}
              >
                <I.Folder size={13} /> {folder.recursive ? "Scan top level only" : "Include nested folders"}
              </button>
            </div>
          }
        />
      </section>

      <p className="mt-8 max-w-[70ch] text-[11px] leading-relaxed text-ink-3">
        Nested-directory policy: Vesper scans only the top level of an imported folder unless
        <em> Scan nested folders</em> is enabled for that folder. Files already in the library are
        identified by a normalised path key, so re-importing never creates duplicates. Removing a
        playlist from the library never deletes a single file from disk.
      </p>
    </div>
  );
}
