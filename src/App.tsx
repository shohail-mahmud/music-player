import { useEffect } from "react";
import { Desktop } from "./components/Desktop";
import { WidgetWindow } from "./components/Widget";
import {
  cycleRepeat,
  init,
  next,
  previous,
  seek,
  setShuffle,
  setWidget,
  toggleMute,
  togglePlay,
  useApp,
} from "./state/store";

const WIDGET_URL_PARAM = "window";
const WIDGET_URL_VALUE = "widget";

export function isWidgetWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(WIDGET_URL_PARAM) === WIDGET_URL_VALUE;
}

/** Application shortcuts. Never captured while the user is typing. */
function useKeyboardShortcuts(enabled: boolean) {
  const state = useApp();

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          void togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) void previous();
          else seek(Math.max(0, state.playback.position - 5));
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) void next();
          else seek(state.playback.position + 5);
          break;
        case "s":
        case "S":
          setShuffle(!state.playback.shuffle);
          break;
        case "r":
        case "R":
          cycleRepeat();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "w":
        case "W":
          setWidget({ visible: !state.widget.visible });
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, state.playback.position, state.playback.shuffle, state.widget.visible]);
}

export default function App() {
  const widgetWindow = isWidgetWindow();
  const state = useApp();
  useKeyboardShortcuts(!widgetWindow);

  useEffect(() => {
    void init(widgetWindow);
  }, [widgetWindow]);

  if (widgetWindow) return <WidgetWindow />;
  if (!state.ready) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1b1a24]">
        <div className="glass h-[188px] w-[384px] rounded-[22px] border border-white/12" />
      </div>
    );
  }
  return <Desktop />;
}
