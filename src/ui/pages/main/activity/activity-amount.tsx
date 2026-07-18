import { FC, useLayoutEffect, useRef } from "react";
import cn from "classnames";
import s from "./styles.module.scss";

interface Props {
  /** Signed number text, e.g. "+ 2,567,890.1" (no sign for a split). */
  amount: string;
  symbol: string;
  /** Colour the row as an incoming (green) amount. */
  positive?: boolean;
}

/** Min px kept for the symbol (~3 chars + ellipsis) before the number shrinks. */
const MIN_SYMBOL_WIDTH = 30;

/**
 * A right-aligned activity amount. The number keeps its size and the symbol
 * ellipsizes to fit the 50%-capped column; only once the symbol has been
 * squeezed down to ~3 chars does the whole thing shrink its font (down to 8px).
 */
const ActivityAmount: FC<Props> = ({ amount, symbol, positive }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const symRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const num = numRef.current;
    const symEl = symRef.current;
    if (!root || !num || !symEl) return;

    const fit = () => {
      // Available width = the (max-width:50%) amounts column.
      const avail = root.parentElement?.clientWidth ?? 0;
      root.style.fontSize = "14px";
      if (avail <= 0) return;
      const numWidth = num.scrollWidth;
      // The symbol is allowed to ellipsize down to MIN_SYMBOL_WIDTH; only when
      // it's already at that floor and the number still overflows do we shrink
      // the font. The ellipsis check keeps short symbols from over-shrinking.
      const symbolEllipsized = symEl.scrollWidth > symEl.clientWidth + 1;
      if (symbolEllipsized && numWidth > avail - MIN_SYMBOL_WIDTH) {
        const budget = Math.max(0, avail - MIN_SYMBOL_WIDTH);
        const scaled =
          numWidth > 0 ? Math.max(8, Math.floor((14 * budget) / numWidth)) : 14;
        root.style.fontSize = `${scaled}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    if (root.parentElement) ro.observe(root.parentElement);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  });

  return (
    <div ref={rootRef} className={cn(s.amt, { [s.amtIn]: positive })}>
      <span ref={numRef} className={s.amtNum}>
        {amount}
      </span>
      <span ref={symRef} className={s.amtSym}>
        {symbol}
      </span>
    </div>
  );
};

export default ActivityAmount;
