import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps, children: React.ReactNode, filled = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Play = (p: IconProps) => base(p, <path d="M8.2 5.6a.7.7 0 0 1 1.06-.6l9 6.4a.7.7 0 0 1 0 1.2l-9 6.4a.7.7 0 0 1-1.06-.6Z" />, true);
export const Pause = (p: IconProps) => base(p, <path d="M9 5.5h1.6a.9.9 0 0 1 .9.9v11.2a.9.9 0 0 1-.9.9H9a.9.9 0 0 1-.9-.9V6.4A.9.9 0 0 1 9 5.5Zm4.4 0H15a.9.9 0 0 1 .9.9v11.2a.9.9 0 0 1-.9.9h-1.6a.9.9 0 0 1-.9-.9V6.4a.9.9 0 0 1 .9-.9Z" />, true);
export const Prev = (p: IconProps) => base(p, <path d="M18.4 6.2v11.6a.7.7 0 0 1-1.1.6l-8-5.8a.7.7 0 0 1 0-1.2l8-5.8a.7.7 0 0 1 1.1.6ZM6.6 6.4a.8.8 0 0 1 .8.8v9.6a.8.8 0 0 1-1.6 0V7.2a.8.8 0 0 1 .8-.8Z" />, true);
export const Next = (p: IconProps) => base(p, <path d="M5.6 6.2v11.6a.7.7 0 0 0 1.1.6l8-5.8a.7.7 0 0 0 0-1.2l-8-5.8a.7.7 0 0 0-1.1.6ZM17.4 6.4a.8.8 0 0 0-.8.8v9.6a.8.8 0 0 0 1.6 0V7.2a.8.8 0 0 0-.8-.8Z" />, true);
export const Shuffle = (p: IconProps) => base(p, <><path d="M17 4.5 20.5 8 17 11.5" /><path d="M17 12.5 20.5 16 17 19.5" /><path d="M3.5 8h3.2c1.2 0 2.3.6 3 1.6l4.1 5.8c.7 1 1.8 1.6 3 1.6h2.2" /><path d="M3.5 16h3.2c1.2 0 2.3-.6 3-1.6l.9-1.3" /><path d="M13.6 9.2l.9-1.3c.7-1 1.8-1.6 3-1.6h2.2" /></>);
export const Repeat = (p: IconProps) => base(p, <><path d="M6.5 3.5h10.2c1.5 0 2.8 1.2 2.8 2.8v2.4" /><path d="M17.5 20.5H7.3A2.8 2.8 0 0 1 4.5 17.7v-2.4" /><path d="M8.4 1.9 6.2 3.5l2.2 1.6" /><path d="M15.6 22.1l2.2-1.6-2.2-1.6" /></>);
export const RepeatOne = (p: IconProps) => base(p, <><path d="M6.5 3.5h10.2c1.5 0 2.8 1.2 2.8 2.8v2.4" /><path d="M17.5 20.5H7.3A2.8 2.8 0 0 1 4.5 17.7v-2.4" /><path d="M8.4 1.9 6.2 3.5l2.2 1.6" /><path d="M15.6 22.1l2.2-1.6-2.2-1.6" /><path d="M11 15.4l1.4-1v4.2" /></>);
export const Volume = (p: IconProps) => base(p, <><path d="M4.5 9.4h2.7l4-3.2a.7.7 0 0 1 1.16.6v10.4a.7.7 0 0 1-1.16.6l-4-3.2H4.5a.9.9 0 0 1-.9-.9v-3.4a.9.9 0 0 1 .9-.9Z" /><path d="M16 9.2a3.8 3.8 0 0 1 0 5.6" /><path d="M18.6 6.8a7.3 7.3 0 0 1 0 10.4" /></>);
export const VolumeMute = (p: IconProps) => base(p, <><path d="M4.5 9.4h2.7l4-3.2a.7.7 0 0 1 1.16.6v10.4a.7.7 0 0 1-1.16.6l-4-3.2H4.5a.9.9 0 0 1-.9-.9v-3.4a.9.9 0 0 1 .9-.9Z" /><path d="M16.4 9.8 21 14.4" /><path d="M21 9.8l-4.6 4.6" /></>);
export const Plus = (p: IconProps) => base(p, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Folder = (p: IconProps) => base(p, <path d="M3.5 6.6c0-1 .8-1.8 1.8-1.8h3.3c.5 0 1 .2 1.4.6l1.2 1.2h6.5c1 0 1.8.8 1.8 1.8v8.6c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8Z" />);
export const Music = (p: IconProps) => base(p, <><path d="M9 18.2V6.4l9-2v11.5" /><path d="M9 18.2a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z" /><path d="M18 15.9a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z" /></>);
export const Settings = (p: IconProps) => base(p, <><circle cx="12" cy="12" r="2.9" /><path d="M19.2 14.4a1.4 1.4 0 0 0 .3 1.6l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-2.4 1v.2a1.7 1.7 0 1 1-3.4 0v-.1a1.4 1.4 0 0 0-2.4-1l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0-1-2.4H5a1.7 1.7 0 0 1 0-3.4h.1a1.4 1.4 0 0 0 1-2.4l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 2.4-1V5a1.7 1.7 0 1 1 3.4 0v.1a1.4 1.4 0 0 0 2.4 1l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0 1 2.4h.2a1.7 1.7 0 1 1 0 3.4h-.1a1.4 1.4 0 0 0-1.3.9Z" /></>);
export const Home = (p: IconProps) => base(p, <><path d="M4 10.4 12 4l8 6.4" /><path d="M5.8 9.6V18c0 .9.7 1.6 1.6 1.6h9.2c.9 0 1.6-.7 1.6-1.6V9.6" /><path d="M9.8 19.6v-5.4h4.4v5.4" /></>);
export const X = (p: IconProps) => base(p, <><path d="M6.2 6.2 17.8 17.8" /><path d="M17.8 6.2 6.2 17.8" /></>);
export const Minus = (p: IconProps) => base(p, <path d="M5.5 12h13" />);
export const Square = (p: IconProps) => base(p, <rect x="5.5" y="5.5" width="13" height="13" rx="1.6" />);
export const More = (p: IconProps) => base(p, <><circle cx="5.6" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="18.4" cy="12" r="1.3" fill="currentColor" stroke="none" /></>);
export const Refresh = (p: IconProps) => base(p, <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.2 4.6v4.2H16" /></>);
export const Trash = (p: IconProps) => base(p, <><path d="M4.8 6.8h14.4" /><path d="M9.4 6.8V5.2c0-.8.6-1.4 1.4-1.4h2.4c.8 0 1.4.6 1.4 1.4v1.6" /><path d="M6.6 6.8 7.4 19c0 .9.7 1.6 1.6 1.6h6c.9 0 1.6-.7 1.6-1.6l.8-12.2" /><path d="M10.6 10.4v6.2" /><path d="M13.4 10.4v6.2" /></>);
export const Eye = (p: IconProps) => base(p, <><path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="2.7" /></>);
export const EyeOff = (p: IconProps) => base(p, <><path d="M4.2 4.2 19.8 19.8" /><path d="M9.6 6.3A8.6 8.6 0 0 1 12 5.9c6 0 9.4 6.1 9.4 6.1a17 17 0 0 1-3 3.7" /><path d="M6.2 8.2A16.6 16.6 0 0 0 2.6 12S6 18.1 12 18.1a8.9 8.9 0 0 0 3.5-.7" /><path d="M10.1 10.2a2.7 2.7 0 0 0 3.7 3.7" /></>);
export const Pin = (p: IconProps) => base(p, <><path d="M9.2 3.6h5.6l-.7 5.1 3 3.1H6.9l3-3.1Z" /><path d="M12 11.8v8.6" /></>);
export const ChevronRight = (p: IconProps) => base(p, <path d="M9.5 5.5 16 12l-6.5 6.5" />);
export const ChevronLeft = (p: IconProps) => base(p, <path d="M14.5 5.5 8 12l6.5 6.5" />);
export const ChevronDown = (p: IconProps) => base(p, <path d="M5.5 9.5 12 16l6.5-6.5" />);
export const Check = (p: IconProps) => base(p, <path d="M4.8 12.6 9.6 17.4 19.2 6.9" />);
export const Warning = (p: IconProps) => base(p, <><path d="M12 4.6 21 19.4H3Z" /><path d="M12 10.2v4.2" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></>);
export const ArrowLeft = (p: IconProps) => base(p, <><path d="M19 12H5" /><path d="M11 6 5 12l6 6" /></>);
export const Panel = (p: IconProps) => base(p, <><rect x="3.2" y="5" width="17.6" height="14" rx="2.4" /><path d="M3.2 9.4h17.6" /><path d="M7.6 13.4h6" /></>);
export const Keyboard = (p: IconProps) => base(p, <><rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2" /><path d="M6.4 9.8h.01M9.6 9.8h.01M12.8 9.8h.01M16 9.8h.01M6.4 13h.01M9.6 13h.01M12.8 13h.01M16 13h.01M8 15.8h8" /></>);
export const Sparkle = (p: IconProps) => base(p, <><path d="M12 3.4 13.9 9l5.6 1.9-5.6 1.9L12 18.4 10.1 12.8 4.5 10.9 10.1 9Z" /><path d="M18.6 3.2v3.2M20.2 4.8h-3.2" /></>);

/**
 * Vesper identity mark — two translucent glass shards meeting in a V.
 * Drawn as vector geometry so it scales to 16px and reverses to one colour.
 */
export function Mark({ size = 28, tone = "#5A52D6", ...props }: IconProps & { tone?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.4c.5 0 .96.27 1.2.71l7.6 14.2c.68 1.27-.28 2.78-1.72 2.78H4.92c-1.44 0-2.4-1.51-1.72-2.78l7.6-14.2c.24-.44.7-.71 1.2-.71Z"
        fill={tone}
        opacity="0.16"
      />
      <path
        d="M6.1 6.9 11.05 17.1c.5 1.02 1.9 1.02 2.4 0l4.05-8.4"
        stroke={tone}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.9 6.9 12.75 17.5"
        stroke={tone}
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="12.25" cy="18.9" r="1.15" fill={tone} />
    </svg>
  );
}
