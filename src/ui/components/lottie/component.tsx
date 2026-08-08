import { FC, useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web/build/player/lottie_light";

/** An RGB triple in 0-255 space. */
export type Rgb = [number, number, number];

interface Props {
  /** The lottie animation JSON. */
  animationData: unknown;
  /**
   * Recolor map: each entry replaces a source colour (as authored, 0-255) with
   * a target colour. Lottie stores colours as 0-1 floats, so both are converted.
   */
  recolor?: { from: Rgb; to: Rgb }[];
  loop?: boolean;
  /**
   * Frame range to play, e.g. `[0, 50]`. With `loop: false` the animation holds
   * the segment's last frame — use it to stop before an outro that fades the
   * artwork away.
   */
  segment?: [number, number];
  /** Rendered box size in px (width and height) — keeps animations aligned. */
  size: number;
  className?: string;
}

const to255 = (v: number) => Math.round(v * 255);

/**
 * Deep-clone a lottie animation, swapping any colour that matches one of the
 * `from` entries for its `to`. Lottie colours live in `{ c: { k: [r,g,b,a] } }`
 * nodes (0-1 floats); a small tolerance absorbs authoring rounding.
 */
function recolorAnimation(
  data: unknown,
  map: { from: Rgb; to: Rgb }[]
): unknown {
  if (!map.length) return data;
  const clone = JSON.parse(JSON.stringify(data));

  const swap = (k: number[]) => {
    for (const { from, to } of map) {
      const matches =
        Math.abs(to255(k[0]) - from[0]) <= 2 &&
        Math.abs(to255(k[1]) - from[1]) <= 2 &&
        Math.abs(to255(k[2]) - from[2]) <= 2;
      if (matches) {
        k[0] = to[0] / 255;
        k[1] = to[1] / 255;
        k[2] = to[2] / 255;
        return;
      }
    }
  };

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const colorK = (value as { k?: unknown } | undefined)?.k;
      if (
        key === "c" &&
        Array.isArray(colorK) &&
        colorK.length >= 3 &&
        typeof colorK[0] === "number"
      ) {
        swap(colorK as number[]);
      } else {
        walk(value);
      }
    }
  };

  walk(clone);
  return clone;
}

/**
 * Renders a lottie JSON animation at a fixed square size. Uses the `lottie_light`
 * player (no expressions) so the bundle stays small.
 */
const Lottie: FC<Props> = ({
  animationData,
  recolor = [],
  loop = false,
  segment,
  size,
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: "svg",
      loop,
      autoplay: true,
      animationData: recolorAnimation(animationData, recolor),
      ...(segment ? { initialSegment: segment } : {}),
    });
    animRef.current = anim;
    return () => {
      anim.destroy();
      animRef.current = null;
    };
    // Recolor/animationData are module-level constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationData, loop, segment?.[0], segment?.[1]]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
};

export default Lottie;
