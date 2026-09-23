import type { CSSProperties } from "react";

const paths: Record<string, string> = {
  city: "M3 21h18M5 21V9h6v12M11 21V3h7v18M18 12h3v9M7 12h1m-1 4h1m6-10h1m-1 4h1m-1 4h1",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  transport:
    "M5 16V5c0-3 14-3 14 0v11H5Zm0-8h14M7 16v4m10-4v4M8 12h.01M16 12h.01",
  ecology: "M20 3C9 2 3 6 5 14c3 8 16 6 15-11ZM4 21 15 10",
  social:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-4a4 4 0 0 1 0 8",
  safety: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
  services: "m14 6 4-4 4 4-4 4M4 20l9-9M3 6l3-3 5 5-3 3-5-5Zm11 8 7 7",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  sparkle: "m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  reset: "M3 10a9 9 0 1 1 2 8M3 3v7h7",
  chart: "M4 20h17M7 16v-5m5 5V4m5 12V8",
  book: "M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3V4Zm9 2v15",
  close: "m6 6 12 12M6 18 18 6",
};

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.info} />
    </svg>
  );
}
