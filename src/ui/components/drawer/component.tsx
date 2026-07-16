import { FC, ReactNode, useEffect } from "react";
import cn from "classnames";
import { XIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet drawer that slides up from the bottom of the popup. */
const Drawer: FC<Props> = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (open) document.body.classList.add("lock");
    else document.body.classList.remove("lock");
    return () => document.body.classList.remove("lock");
  }, [open]);

  return (
    <div className={cn(s.root, { [s.open]: open })} aria-hidden={!open}>
      <div className={s.overlay} onClick={onClose} />
      <div className={s.sheet}>
        <div className={s.head}>
          <span className={s.title}>{title}</span>
          <button type="button" className={s.close} onClick={onClose}>
            <XIcon size={18} />
          </button>
        </div>
        <div className={s.body}>{children}</div>
      </div>
    </div>
  );
};

export default Drawer;
