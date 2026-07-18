import { FC, ReactNode, useLayoutEffect, useRef } from "react";

interface Props {
  children: ReactNode;
  /** Font size (px) when the content fits comfortably. */
  maxFont: number;
  /** Smallest font size (px) it will ever shrink to. */
  minFont: number;
  /** Hard cap on the rendered content width (px). */
  maxWidth?: number;
  /**
   * Keep the content at least this many px from both screen edges. Use for
   * screen-centered values; combined with `maxWidth` and the parent width, the
   * smallest constraint wins.
   */
  screenMargin?: number;
  /** Shrink to fit the parent element's width (e.g. a `max-width`-capped box). */
  fitParent?: boolean;
  className?: string;
}

/**
 * Renders inline text that shrinks its font size (down to `minFont`) so the
 * content never exceeds the given width constraint(s). Children scale together,
 * so nested `em`-sized parts (e.g. a symbol) shrink with the number.
 */
const FitText: FC<Props> = ({
  children,
  maxFont,
  minFont,
  maxWidth,
  screenMargin,
  fitParent,
  className,
}) => {
  const ref = useRef<HTMLSpanElement>(null);

  // Runs after every render (content changes refit) and re-measures on resize.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      let limit = maxWidth ?? Infinity;
      if (screenMargin !== undefined) {
        limit = Math.min(limit, window.innerWidth - screenMargin * 2);
        const parentWidth = el.parentElement?.clientWidth;
        if (parentWidth) limit = Math.min(limit, parentWidth);
      }
      if (fitParent) {
        const parentWidth = el.parentElement?.clientWidth;
        if (parentWidth) limit = Math.min(limit, parentWidth);
      }

      el.style.fontSize = `${maxFont}px`;
      const width = el.scrollWidth;
      if (width > limit && width > 0) {
        const scaled = Math.max(minFont, Math.floor((maxFont * limit) / width));
        el.style.fontSize = `${scaled}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  });

  return (
    <span
      ref={ref}
      className={className}
      style={{ whiteSpace: "nowrap", display: "inline-block" }}
    >
      {children}
    </span>
  );
};

export default FitText;
