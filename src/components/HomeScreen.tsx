import { useState } from "react";
import {
  importFolder,
  importTracks,
  playFromList,
  refreshFolder,
  removeFolder,
  selectors,
  setView,
  setWidget,
  togglePlay,
  useApp,
} from "../state/store";
import { formatCount, formatDurationTotal, formatTime } from "../lib/format";
import { TrackTable } from "./TrackTable";
import * as I from "./Icons";

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-rule pb-2">
      <h2 className="plate text-ink-3">{children}</h2>
      {right}
    </div>
  );
}

export function HomeScreen() {
  const state = useApp();
  const { library, playback, settings } = state;
  const [hovered, setHovered] = useState<string | null>(null);
  const loose = selectors.looseTracks();
  const totalTracks = selectors.totalTracks();
  const totalDuration = Object.values(library.tracks).reduce((sum, t) => sum + (t.duration || 0), 0);
  const isEmpty = library.folders.length === 0 && loose.length === 0;

  return (
    <div className="fade px-10 pt-9 pb-12">
      <header className="mb-9">
        <div className="plate mb-4 flex items-center gap-3 text-ink-3">
          <span>Local library</span>
          <span className="h-[1px] w-8 bg-rule" />
          <span className="tnum">{new Date().getFullYear()}</span>
        </div>
        <h1 className="font-display text-[clamp(2.4rem,4.6vw,3.75rem)] leading-[0.94] font-light tracking-[-0.022em] text-ink">
          Your music,
          <br />
          kept <em className="font-normal italic text-accent">local</em>.
        </h1>
        <p className="mt-4 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-2">
          Vesper plays the files where they already live. Nothing is copied, uploaded or
          matched against a catalogue — the library you build here stays on this machine.
        </p>
      </header>

      {/* Asymmetric split: tall import panel, quiet label-plate column */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="relative rounded-[10px] border border-dashed border-[#C9C2D4] bg-white/45 p-7">
          <div className="flex items-start gap-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
              <I.Plus size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[26px] leading-none font-normal tracking-[-0.015em] text-ink">
                Import Music
              </h2>
              <p className="mt-2.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-2">
                Bring in a folder to create a playlist that mirrors it on disk, or add
                individual files without touching their parent directory.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button className="btn btn-primary" onClick={() => void importFolder()}>
              <I.Folder size={15} /> Import Folder
            </button>
            <button className="btn btn-ghost" onClick={() => void importTracks()}>
              <I.Music size={15} /> Import Track
            </button>
            <span className="plate ml-auto text-ink-3">MP3 · WAV · FLAC · M4A · AAC · OGG</span>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-rule pt-5 sm:grid-cols-4">
            {[
              ["Tracks", formatCount(totalTracks, "track")],
              ["Folders", formatCount(library.folders.length, "folder")],
              ["Runtime", formatDurationTotal(totalDuration)],
              ["Scan policy", settings.recursiveScan ? "Recursive" : "Top level"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="plate text-ink-3">{label}</dt>
                <dd className="tnum mt-1.5 text-[15px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="flex flex-col gap-5">
          <div className="rounded-[10px] border border-rule bg-white/55 p-5">
            <h3 className="plate text-ink-3">Desktop widget</h3>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">
              The glass mini-player floats above your other windows and shares this exact
              playback session — same track, same queue, same volume.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-accent" onClick={() => setWidget({ visible: !state.widget.visible })}>
                {state.widget.visible ? <I.EyeOff size={14} /> : <I.Eye size={14} />}
                {state.widget.visible ? "Hide widget" : "Show widget"}
              </button>
              <button className="btn btn-ghost" onClick={() => setView({ name: "settings" })}>
                <I.Settings size={14} /> Settings
              </button>
            </div>
          </div>

          <div className="rounded-[10px] border border-rule bg-white/55 p-5">
            <h3 className="plate text-ink-3">Keyboard</h3>
            <ul className="mt-3 space-y-2">
              {[
                ["Space", "Play / pause"],
                ["←  →", "Seek 5 seconds"],
                ["Shift + ←  →", "Previous / next track"],
                ["S", "Toggle shuffle"],
                ["R", "Cycle repeat"],
                ["W", "Toggle widget"],
              ].map(([keys, what]) => (
                <li key={keys} className="flex items-center justify-between gap-4">
                  <span className="tnum rounded-[5px] border border-rule bg-white px-2 py-[3px] text-[10px] text-ink-2">
                    {keys}
                  </span>
                  <span className="text-[11.5px] text-ink-2">{what}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {isEmpty && (
        <section className="mt-10 flex flex-col items-center gap-6 rounded-[10px] border border-rule bg-white/55 px-8 py-14 text-center">
          <img
            src={selectors.artworkFor(null)}
            alt=""
            className="h-24 w-24 rounded-[8px] object-cover opacity-80 shadow-[0_12px_32px_rgba(43,38,74,0.18)]"
          />
          <div>
            <h2 className="font-display text-[28px] leading-tight font-light text-ink">
              Nothing imported yet
            </h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-relaxed text-ink-2">
              Start with the folder that holds an album. Vesper reads the files in place and
              builds a playlist from their real metadata.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button className="btn btn-primary" onClick={() => void importFolder()}>
              <I.Folder size={15} /> Import Folder
            </button>
            <button className="btn btn-ghost" onClick={() => void importTracks()}>
              <I.Music size={15} /> Import Track
            </button>
          </div>
        </section>
      )}

      {library.folders.length > 0 && (
        <section className="mt-12">
          <SectionLabel
            right={
              <button className="icon-btn h-7 w-7" onClick={() => void importFolder()} title="Add another folder">
                <I.Plus size={15} />
              </button>
            }
          >
            Folder playlists
          </SectionLabel>

          <ul role="list">
            {library.folders.map((folder, index) => {
              const tracks = selectors.folderTracks(folder);
              const duration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
              return (
                <li
                  key={folder.id}
                  className="group border-b border-rule-soft transition-colors duration-150 hover:bg-white/60"
                  onMouseEnter={() => setHovered(folder.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="flex items-center gap-5 py-4">
                    <button
                      className="tnum w-7 shrink-0 text-right text-[12px] text-ink-3"
                      onClick={() => setView({ name: "playlist", id: folder.id })}
                      title={`Open ${folder.name}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </button>

                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setView({ name: "playlist", id: folder.id })}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-display text-[19px] leading-tight font-normal tracking-[-0.012em] text-ink">
                          {folder.name}
                        </span>
                        {folder.sample && (
                          <span className="plate rounded-full bg-accent/10 px-2 py-[3px] text-accent">Sample</span>
                        )}
                        {folder.missing && (
                          <span className="plate rounded-full bg-[#B4453A]/10 px-2 py-[3px] text-[#B4453A]">
                            Unavailable
                          </span>
                        )}
                      </div>
                      <div className="tnum mt-1 truncate-1 text-[11px] text-ink-3">{folder.path}</div>
                    </button>

                    <div className="hidden w-28 shrink-0 text-right sm:block">
                      <div className="tnum text-[12.5px] text-ink-2">{formatCount(tracks.length, "track")}</div>
                      <div className="tnum text-[10.5px] text-ink-3">{formatTime(duration)}</div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="icon-btn h-8 w-8"
                        onClick={() => void playFromList(tracks, 0, false)}
                        title={`Play ${folder.name}`}
                        aria-label={`Play ${folder.name}`}
                      >
                        <I.Play size={15} />
                      </button>
                      <button
                        className={`icon-btn h-8 w-8 ${hovered === folder.id ? "opacity-100" : "opacity-0"} transition-opacity`}
                        onClick={() => void playFromList(tracks, 0, true)}
                        title="Shuffle"
                        aria-label={`Shuffle ${folder.name}`}
                      >
                        <I.Shuffle size={15} />
                      </button>
                      <button
                        className={`icon-btn h-8 w-8 ${hovered === folder.id ? "opacity-100" : "opacity-0"} transition-opacity`}
                        onClick={() => void refreshFolder(folder.id)}
                        title="Refresh folder contents"
                        aria-label={`Refresh ${folder.name}`}
                      >
                        <I.Refresh size={15} />
                      </button>
                      <button
                        className={`icon-btn h-8 w-8 ${hovered === folder.id ? "opacity-100" : "opacity-0"} transition-opacity`}
                        onClick={() => removeFolder(folder.id)}
                        title="Remove from library (files stay on disk)"
                        aria-label={`Remove ${folder.name} from library`}
                      >
                        <I.Trash size={15} />
                      </button>
                      <button
                        className="icon-btn h-8 w-8"
                        onClick={() => setView({ name: "playlist", id: folder.id })}
                        title="Open playlist"
                        aria-label={`Open ${folder.name}`}
                      >
                        <I.ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(loose.length > 0 || !isEmpty) && (
        <section className="mt-12">
          <SectionLabel
            right={
              <button className="btn btn-ghost py-1.5 text-[11.5px]" onClick={() => void importTracks()}>
                <I.Plus size={13} /> Import Track
              </button>
            }
          >
            Individual tracks
          </SectionLabel>
          <div className="mt-3">
            <TrackTable
              tracks={loose}
              currentId={playback.trackId}
              showAlbum={false}
              onPlay={(index) => void playFromList(loose, index, false)}
              emptyState={
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-[12.5px] text-ink-2">
                    No loose tracks yet — import single files to keep them here, outside any folder playlist.
                  </p>
                  <button className="btn btn-ghost py-1.5 text-[11.5px]" onClick={() => void importTracks()}>
                    <I.Music size={13} /> Import Track
                  </button>
                </div>
              }
            />
          </div>
        </section>
      )}

      {!isEmpty && (
        <div className="mt-10 flex items-center gap-3">
          <button className="btn btn-accent" onClick={() => void togglePlay()}>
            <I.Play size={14} /> {playback.status === "playing" ? "Playing" : "Resume session"}
          </button>
          <span className="plate text-ink-3">
            {playback.trackId ? "Playback resumes where you left off" : "Nothing playing yet"}
          </span>
        </div>
      )}
    </div>
  );
}
