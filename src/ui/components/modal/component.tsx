import { Dialog, Transition } from "@headlessui/react";
import { FC, Fragment, ReactNode, useEffect, useRef } from "react";
import { XIcon } from "@/ui/icons/phosphor";
import cn from "classnames";
import s from "./styles.module.scss";

interface Props {
  title: string;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  className?: string;
  panelClassName?: string;
}

const Modal: FC<Props> = ({
  title,
  children,
  open,
  onClose,
  className,
  panelClassName,
}) => {
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) {
      document.body.classList.add("lock");
    } else {
      document.body.classList.remove("lock");
    }
    return () => {
      document.body.classList.remove("lock");
    };
  }, [open]);

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog
        as="div"
        className={cn(s.dialog, className)}
        onClose={onClose}
        initialFocus={closeRef}
      >
        <Transition.Child
          as={Fragment}
          enter={s.fadeEnter}
          enterFrom={s.fadeFrom}
          enterTo={s.fadeTo}
          leave={s.fadeLeave}
          leaveFrom={s.fadeTo}
          leaveTo={s.fadeFrom}
        >
          <div className={s.overlay} />
        </Transition.Child>

        <div className={s.scroller}>
          <div className={s.centerer}>
            <Transition.Child
              as={Fragment}
              enter={s.slideEnter}
              enterFrom={s.slideFrom}
              enterTo={s.slideTo}
              leave={s.slideLeave}
              leaveFrom={s.slideTo}
              leaveTo={s.slideFrom}
            >
              <Dialog.Panel className={panelClassName ?? s.panel}>
                <Dialog.Title as="h3" className={s.title}>
                  {title}
                </Dialog.Title>
                <button
                  ref={closeRef}
                  className={s.close}
                  onClick={onClose}
                  type="button"
                >
                  <XIcon size={18} />
                </button>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default Modal;
