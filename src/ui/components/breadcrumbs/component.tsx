import { FC } from "react";
import cn from "classnames";
import s from "./styles.module.scss";

interface Props {
  steps: string[];
  /** zero-based index of the active step */
  current: number;
  className?: string;
}

/** Compact step indicator: one dot per step, the active one stretched. */
const Breadcrumbs: FC<Props> = ({ steps, current, className }) => {
  if (steps.length < 2) return null;
  return (
    <nav className={cn(s.dots, className)} aria-label={steps[current]}>
      {steps.map((label, i) => (
        <span
          key={label}
          title={label}
          className={cn(s.dot, {
            [s.current]: i === current,
            [s.done]: i < current,
          })}
        />
      ))}
    </nav>
  );
};

export default Breadcrumbs;
