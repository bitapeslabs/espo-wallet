import { FC, useId, useRef, useState } from "react";
import s from "./styles.module.scss";

interface Props {
  /** Price points in chronological order (oldest first). */
  points: number[];
  /** Matching candle open times (unix seconds); enables the hover time label. */
  timestamps?: number[];
  /** Green when the range closed up, red when down. */
  up: boolean;
  /** Rendered height in px (width flexes to the container). */
  height?: number;
  /** Reports the hovered point index (or null when the cursor leaves). */
  onHover?: (index: number | null) => void;
}

// Top padding keeps the line clear of the hover time label; bottom padding
// leaves room for the range buttons overlaid at the bottom.
const TOP_PAD = 22;
const BOT_PAD = 22;
const MID = (TOP_PAD + (100 - BOT_PAD)) / 2;

/** e.g. "06:00 AM, Jul 02" */
function formatHoverTime(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
  return `${time}, ${date}`;
}

/**
 * A lightweight price line chart: a normalized polyline with a faint area
 * gradient and a scrubbable hover indicator. `preserveAspectRatio="none"`
 * stretches it to any width; the stroke stays crisp via `vector-effect`. With
 * fewer than two points it draws a flat grey line + grey gradient (the "no
 * data" state). No chart library.
 */
const PriceChart: FC<Props> = ({
  points,
  timestamps,
  up,
  height = 150,
  onHover,
}) => {
  const gradId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  const hasData = n > 1;
  const color = hasData ? (up ? "var(--success)" : "var(--danger)") : "var(--muted2)";

  // Normalize into a 0..100 x 0..100 space with vertical padding. A flat series
  // (all equal, or no data) sits at mid-height rather than pinned to an edge.
  const min = hasData ? Math.min(...points) : 0;
  const max = hasData ? Math.max(...points) : 0;
  const flat = max === min;
  const span = max - min || 1;
  const xy = hasData
    ? points.map((p, i) => {
        const x = (i / (n - 1)) * 100;
        const y = flat
          ? MID
          : TOP_PAD + (1 - (p - min) / span) * (100 - TOP_PAD - BOT_PAD);
        return [x, y] as const;
      })
    : [
        [0, MID],
        [100, MID],
      ];

  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,100 ${line} 100,100`;

  const move = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || !hasData) return;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width ? (clientX - rect.left) / rect.width : 0;
    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    setHover(idx);
    onHover?.(idx);
  };
  const leave = () => {
    setHover(null);
    onHover?.(null);
  };

  const hi = hover != null && hasData ? xy[hover] : null;

  return (
    <div
      ref={wrapRef}
      className={s.wrap}
      style={{ height }}
      onMouseMove={(e) => move(e.clientX)}
      onMouseLeave={leave}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
      onTouchEnd={leave}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradId})`} stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {hi ? (
        <>
          {timestamps && hover != null && timestamps[hover] != null ? (
            <span
              className={s.timeLabel}
              style={{ left: `${Math.min(82, Math.max(18, hi[0]))}%` }}
            >
              {formatHoverTime(timestamps[hover])}
            </span>
          ) : undefined}
          <span className={s.vline} style={{ left: `${hi[0]}%` }} />
          <span
            className={s.dot}
            style={{
              left: `${hi[0]}%`,
              top: `${hi[1]}%`,
              background: color,
            }}
          />
        </>
      ) : undefined}
    </div>
  );
};

export default PriceChart;
