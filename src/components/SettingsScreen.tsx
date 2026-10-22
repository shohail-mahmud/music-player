import {
  clearSampleCollection,
  setSettings,
  setShuffle,
  setView,
  setWidget,
  useApp,
} from "../state/store";
import { SUPPORTED_EXTENSIONS } from "../lib/path";
import { runtime } from "../state/bridge";
import * as I from "./Icons";

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8 border-b border-rule-soft py-4">
      <div className="max-w-[52ch]">
        <div className="text-[13px] leading-tight text-ink">{label}</div>
        {description && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[40px] rounded-full transition-colors duration-200 ${
        checked ? "bg-accent" : "bg-[#D6D1CB]"
      }`}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.28)] transition-all duration-200"
        style={{ left: checked ? 21 : 3 }}
      />
    </button>
  );
}

function Section({
  index,
  title,
  caption,
  children,
}: {
  index: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-6 border-t border-rule pt-7 pb-9 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <div className="plate text-ink-3">{index}</div>
        <h2 className="font-display mt-2.5 text-[21px] leading-tight font-normal tracking-[-0.012em] text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">{caption}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const state = useApp();
  const { settings, widget, playback } = state;

  return (
    <div className="fade px-10 pt-8 pb-14">
      <button
        className="plate flex items-center gap-2 text-ink-3 transition-colors hover:text-ink"
        onClick={() => setView({ name: "home" })}
      >
        <I.ArrowLeft size={13} /> Library
      </button>

      <header className="mt-6 mb-9">
        <h1 className="font-display text-[clamp(2.1rem,3.6vw,2.9rem)] leading-[1.02] font-light tracking-[-0.022em] text-ink">
          Settings
        </h1>
        <p className="mt-3 max-w-[54ch] text-[13px] leading-relaxed text-ink-2">
          Everything here is stored locally and survives restarts, Windows updates and
          application updates.
        </p>
      </header>

      <Section
        index="01 / Library"
        title="Scanning & imports"
        caption="How folders are read when they are added to the library."
      >
        <Row
          label="Include nested folders when scanning"
          description="Off by default: only files sitting directly in the imported folder are read. Turn it on to build playlists from an entire folder tree. Per-folder overrides are available in each playlist's Manage menu."
        >
          <Toggle
            checked={settings.recursiveScan}
            onChange={(v) => setSettings({ recursiveScan: v })}
            label="Include nested folders"
          />
        </Row>
        <Row
          label="Remember the last open playlist"
          description="The library reopens exactly where you left it."
        >
          <Toggle
            checked={settings.rememberLastPlaylist}
            onChange={(v) => setSettings({ rememberLastPlaylist: v })}
            label="Remember last playlist"
          />
        </Row>
        <Row
          label="Supported audio formats"
          description="Format support ultimately depends on the platform decoder. Windows playback uses the rodio/symphonia backend; the browser preview uses the Chromium media stack."
        >
          <div className="flex max-w-[240px] flex-wrap justify-end gap-1.5">
            {SUPPORTED_EXTENSIONS.map((ext) => (
              <span
                key={ext}
                className="plate rounded-[4px] border border-rule bg-white px-2 py-[5px] text-ink-2"
              >
                {ext}
              </span>
            ))}
          </div>
        </Row>
      </Section>

      <Section
        index="02 / Widget"
        title="Desktop widget"
        caption="The floating glass mini-player. It shares this exact playback session."
      >
        <Row label="Show the desktop widget" description="Hiding it never stops the music.">
          <Toggle checked={widget.visible} onChange={(v) => setWidget({ visible: v })} label="Show widget" />
        </Row>
        <Row
          label="Always on top"
          description="Off by default so the widget never blocks the window you are working in. Turn it on to pin the widget above everything."
        >
          <Toggle
            checked={widget.alwaysOnTop}
            onChange={(v) => setWidget({ alwaysOnTop: v })}
            label="Always on top"
          />
        </Row>
        <Row label="Size" description="Compact keeps just artwork, title and transport controls.">
          <div className="flex overflow-hidden rounded-full border border-rule">
            {(["compact", "expanded"] as const).map((size) => (
              <button
                key={size}
                onClick={() => setWidget({ size })}
                className={`plate px-4 py-2 transition-colors duration-150 ${
                  widget.size === size ? "bg-ink text-paper" : "bg-white text-ink-2 hover:bg-paper"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </Row>
        <Row label={`Glass opacity — ${Math.round(widget.opacity * 100)}%`} description="Keeps text readable over bright wallpapers.">
          <input
            type="range"
            className="vesper-range w-[180px]"
            min={55}
            max={100}
            value={Math.round(widget.opacity * 100)}
            onChange={(e) => setWidget({ opacity: Number(e.target.value) / 100 })}
            aria-label="Widget opacity"
            style={
              {
                "--track-h": "3px",
                "--track-bg": "rgba(23,22,28,0.14)",
                "--thumb-bg": "#5A52D6",
              } as React.CSSProperties
            }
          />
        </Row>
        <Row label="Album artwork">
          <Toggle checked={widget.showArtwork} onChange={(v) => setWidget({ showArtwork: v })} label="Show artwork" />
        </Row>
        <Row label="Progress bar and timecodes">
          <Toggle checked={widget.showProgress} onChange={(v) => setWidget({ showProgress: v })} label="Show progress" />
        </Row>
        <Row label="Volume slider">
          <Toggle checked={widget.showVolume} onChange={(v) => setWidget({ showVolume: v })} label="Show volume" />
        </Row>
        <Row
          label="Reset widget position and size"
          description="Returns the widget to its default place on the desktop."
        >
          <button
            className="btn btn-ghost py-1.5 text-[11.5px]"
            onClick={() => setWidget({ x: 0, y: 0, width: widget.size === "compact" ? 300 : 384, height: widget.size === "compact" ? 96 : 188 })}
          >
            Reset
          </button>
        </Row>
      </Section>

      <Section index="03 / Data" title="Storage & privacy" caption="Where the library lives and what leaves the machine.">
        <Row
          label="Library database"
          description={
            runtime.isTauri
              ? "%LOCALAPPDATA%\\Vesper\\library.db — per-user application data, never the install directory or a temporary folder."
              : "Browser preview: the library is kept in localStorage so the interface can be evaluated. In the Windows build this is a SQLite database in %LOCALAPPDATA%\\Vesper\\."
          }
        >
          <span className="plate rounded-[4px] border border-rule bg-white px-2.5 py-2 text-ink-2">
            {runtime.isTauri ? "SQLite · library.db" : "localStorage · preview"}
          </span>
        </Row>
        <Row
          label="Nothing is uploaded"
          description="No account, no telemetry, no analytics, no network requests. Files are read in place and never copied into application storage."
        >
          <span className="plate flex items-center gap-2 rounded-full bg-accent/10 px-3 py-2 text-accent">
            <I.Check size={12} /> Local only
          </span>
        </Row>
        <Row
          label="Removing entries"
          description="Removing a folder, playlist or track only removes the library entry. The original audio files and their folders are never deleted."
        >
          <span className="plate rounded-[4px] border border-rule bg-white px-2.5 py-2 text-ink-2">Files untouched</span>
        </Row>
        {settings.showSampleCollection && (
          <Row
            label="Remove the sample collection"
            description="The sample folders exist only so the interface can be previewed before importing anything. Their transport is simulated — imported files always play real audio."
          >
            <button className="btn btn-ghost py-1.5 text-[11.5px]" onClick={clearSampleCollection}>
              <I.Trash size={13} /> Remove samples
            </button>
          </Row>
        )}
      </Section>

      <Section index="04 / Playback" title="Session" caption="Current playback state shared with the widget.">
        <Row label="Volume" description={`Set to ${Math.round(playback.volume * 100)}%${playback.muted ? " (muted)" : ""}.`}>
          <span className="tnum text-[13px] text-ink">{Math.round(playback.volume * 100)}%</span>
        </Row>
        <Row label="Repeat mode" description="Off, all, or one. Applies to both windows at once.">
          <span className="plate rounded-[4px] border border-rule bg-white px-2.5 py-2 text-ink-2">
            {playback.repeat}
          </span>
        </Row>
        <Row label="Shuffle" description="No track repeats inside a shuffle cycle unless the queue demands it.">
          <Toggle
            checked={playback.shuffle}
            onChange={(value) => setShuffle(value)}
            label="Shuffle"
          />
        </Row>
      </Section>

      <div className="flex items-center gap-3 border-t border-rule pt-7">
        <button className="btn btn-primary" onClick={() => setView({ name: "home" })}>
          <I.ArrowLeft size={14} /> Back to library
        </button>
        <span className="plate text-ink-3">Vesper · local music player · Windows</span>
      </div>
    </div>
  );
}
