import { FC, useId } from "react";

/** Metallic palettes: gold (1), silver (2), bronze (3). */
const METALS: Record<number, { light: string; dark: string; ring: string }> = {
  1: { light: "#FFE486", dark: "#E0A21A", ring: "#B67F0E" },
  2: { light: "#F2F3F5", dark: "#B4BAC3", ring: "#8A909B" },
  3: { light: "#F0B888", dark: "#C67A3C", ring: "#98582A" },
};

interface Props {
  /** Podium rank; only 1-3 render a medal. */
  rank: number;
  /** Width in px (height keeps the medal's 24:30 aspect). */
  size?: number;
}

/**
 * A small award medal: two crossed ribbons behind a metallic medallion carrying
 * the rank number. Gold (1), silver (2), bronze (3). Used as the status badge on
 * the top-3 trending tokens.
 */
const Medal: FC<Props> = ({ rank, size = 18 }) => {
  const id = useId();
  const m = METALS[rank];
  if (!m) return null;
  return (
    <svg
      width={size}
      height={Math.round((size * 30) / 24)}
      viewBox="0 0 24 30"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={m.light} />
          <stop offset="100%" stopColor={m.dark} />
        </radialGradient>
      </defs>

      {/* crossed ribbons (drawn behind the medallion), with fishtail ends,
          in the app's blurple */}
      <path d="M4.5,0 L7.5,3 L10.5,0 L16.5,14 L11,16.5 Z" fill="var(--link-dark)" />
      <path d="M19.5,0 L16.5,3 L13.5,0 L7.5,14 L13,16.5 Z" fill="var(--link)" />

      {/* medallion */}
      <circle
        cx="12"
        cy="19.5"
        r="9"
        fill={`url(#${id})`}
        stroke={m.ring}
        strokeWidth="1.3"
      />
      <text
        x="12"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="800"
        fill="var(--panel3)"
      >
        {rank}
      </text>
    </svg>
  );
};

export default Medal;
