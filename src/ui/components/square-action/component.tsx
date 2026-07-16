import { FC, ReactNode } from "react";
import { Link } from "react-router-dom";
import s from "./styles.module.scss";

interface Props {
  icon: ReactNode;
  iconHover: ReactNode;
  label: string;
  to?: string;
  onClick?: () => void;
}

/** Square wallet action button; hovering swaps in the filled icon variant. */
const SquareAction: FC<Props> = ({ icon, iconHover, label, to, onClick }) => {
  const inner = (
    <>
      <span className={s.iconDefault}>{icon}</span>
      <span className={s.iconHover}>{iconHover}</span>
      <span>{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={s.squareBtn}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={s.squareBtn} onClick={onClick}>
      {inner}
    </button>
  );
};

export default SquareAction;
