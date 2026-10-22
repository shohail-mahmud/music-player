import { useEffect } from "react";
import { dismissToast, setView, setWidget, toast, useApp } from "../state/store";
import { HomeScreen } from "./HomeScreen";
import { PlaylistScreen } from "./PlaylistScreen";
import { SettingsScreen } from "./SettingsScreen";
import { PlayerBar } from "./PlayerBar";
import { Widget } from "./Widget";
import * as I from "./Icons";
import wallpaper from "../assets/wallpaper.jpg";

function TitleBar() {
  const nativeWindow = () => (window as any).__TAURI__?.window?.getCurrentWindow?.();

  const action = (kind: "minimize" | "maximize" | "close") => {
    const win = nativeWindow();
    if (win) {
      if (kind === "minimize") void win.minimize?.();
      if (kind === "maximize") void win.toggleMaximize?.();
      if (kind === "close") void win.close?.();
      return;
    }
    // In the browser preview there is no native window to drive — say so
    // instead of pretending the button did something.
    toast(
      "info",
      "Window controls live in the desktop build",
      "In the Tauri app these drive the real Windows window; playback keeps running while the widget is open.",
    );
  };

  return (
    <div
      className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-rule/70 pl-4"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2.5">
        <I.Mark size={17} />
        <span className="text-[12.5px] font-medium tracking-[-0.005em] text-ink">Vesper</span>
        <span className="plate text-ink-3">Local music player</span>
      </div>
      <div className="flex h-full items-stretch">
        {[
          { icon: <I.Minus size={13} />, label: "Minimize", kind: "minimize" as const },
          { icon: <I.Square size={11} />, label: "Maximize", kind: "maximize" as const },
          { icon: <I.X size={13} />, label: "Close", kind: "close" as const },
        ].map((item) => (
          <button
            key={item.label}
            aria-label={item.label}
            title={item.label}
            onClick={() => action(item.kind)}
            className={`flex w-12 items-center justify-center text-ink-2 transition-colors duration-150 hover:bg-black/6 hover:text-ink ${
              item.kind === "close" ? "hover:bg-[#C4443A] hover:text-white" : ""
            }`}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function Spine() {
  const state = useApp();
  const items = [
    { key: "home", icon: <I.Home size={18} />, label: "Library", active: state.view.name !== "settings" },
    { key: "settings", icon: <I.Settings size={18} />, label: "Settings", active: state.view.name === "settings" },
  ];

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-rule/70 py-5">
      {items.map((item) => (
        <button
          key={item.key}
          title={item.label}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          onClick={() => setView(item.key === "settings" ? { name: "settings" } : { name: "home" })}
          className={`icon-btn h-10 w-10 ${item.active ? "bg-ink text-paper hover:bg-ink hover:text-paper" : ""}`}
        >
          {item.icon}
        </button>
      ))}

      <div className="flex-1" />

      <button
        title={state.widget.visible ? "Hide desktop widget" : "Show desktop widget"}
        aria-label={state.widget.visible ? "Hide desktop widget" : "Show desktop widget"}
        onClick={() => setWidget({ visible: !state.widget.visible })}
        className={`icon-btn h-10 w-10 ${state.widget.visible ? "text-accent" : ""}`}
      >
        <I.Panel size={18} />
      </button>

      <div className="mt-4 flex h-32 items-center">
        <span className="plate rotate-180 text-ink-3 [writing-mode:vertical-rl]">Local library</span>
      </div>
    </nav>
  );
}

function Toasts() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex w-[min(420px,88vw)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rise pointer-events-auto flex items-start gap-3 rounded-[10px] border border-white/12 bg-[rgba(22,21,30,0.92)] px-4 py-3 text-white shadow-[0_18px_44px_rgba(10,8,24,0.4)]"
          role="status"
        >
          <span
            className={`mt-[2px] ${
              toast.tone === "error" ? "text-[#FF8A7A]" : toast.tone === "success" ? "text-[#A9A2FF]" : "text-white/70"
            }`}
          >
            {toast.tone === "error" ? <I.Warning size={15} /> : <I.Check size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium">{toast.title}</div>
            {toast.detail && <div className="mt-1 text-[11px] leading-relaxed text-white/70">{toast.detail}</div>}
          </div>
          <button className="icon-btn h-6 w-6 text-white/60 hover:bg-white/12 hover:text-white" onClick={() => dismissToast(toast.id)}>
            <I.X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function BusyStrip() {
  const { busy } = useApp();
  if (!busy) return null;
  const pct = busy.total ? Math.round((busy.processed / busy.total) * 100) : 0;
  return (
    <div className="sticky top-0 z-30 border-b border-rule bg-white/92 px-10 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="plate text-ink-2">{busy.label}</span>
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-rule">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${busy.total ? pct : 30}%` }}
          />
        </div>
        <span className="tnum text-[10px] text-ink-3">
          {busy.total ? `${busy.processed} / ${busy.total}` : "…"}
        </span>
      </div>
    </div>
  );
}

function Splash() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#1b1a24]">
      <div className="flex flex-col items-center gap-4">
        <I.Mark size={38} tone="#A9A2FF" />
        <span className="plate text-white/50">Loading library</span>
      </div>
    </div>
  );
}

export function Desktop() {
  const state = useApp();

  // Place the widget once — tucked under the title bar on the right, where the
  // editorial header keeps its whitespace — then remember it across restarts.
  useEffect(() => {
    if (state.widget.x === 0 && state.widget.y === 0) {
      const width = state.widget.size === "compact" ? 300 : 384;
      const x = Math.max(12, window.innerWidth - width - 36);
      const y = Math.max(12, Math.min(72, window.innerHeight - state.widget.height - 12));
      setWidget({ x, y });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state.ready) return <Splash />;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        src={wallpaper}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(28,26,44,0.16),rgba(18,16,32,0.52))]" />

      <div className="relative flex h-full w-full items-center justify-center p-3 lg:p-7">
        <div className="mica flex h-full w-full max-w-[1240px] flex-col overflow-hidden rounded-[12px] shadow-[0_44px_110px_rgba(12,10,28,0.46)] ring-1 ring-black/12">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Spine />
            <main className="scroll-area relative min-w-0 flex-1 overflow-y-auto">
              <BusyStrip />
              {state.view.name === "home" && <HomeScreen />}
              {state.view.name === "playlist" && <PlaylistScreen folderId={state.view.id} />}
              {state.view.name === "settings" && <SettingsScreen />}
            </main>
          </div>
          <PlayerBar />
        </div>
      </div>

      {state.widget.visible && (
        <div
          className="absolute z-40"
          style={{ left: state.widget.x, top: state.widget.y }}
          onPointerDownCapture={() => undefined}
        >
          <Widget mode="desktop" onToggleSize={() => setWidget({ size: state.widget.size === "compact" ? "expanded" : "compact" })} />
        </div>
      )}

      <Toasts />

    </div>
  );
}
