import { CopyFillIcon } from "@/ui/icons/phosphor";
import { FC, HTMLAttributes } from "react";
import s from "./styles.module.scss";
import toast from "react-hot-toast";
import { t } from "i18next";

interface Props extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  value?: string;
  className?: string;
  iconClassName?: string;
  title?: string;
}

const CopyBtn: FC<Props> = ({ label, value, className, title, ...props }) => {
  return (
    <button
      className={className ? className : s.btn}
      onClick={async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        toast.success(t("transaction_info.copied"));
      }}
    >
      {label ? (
        <div {...props} className={s.label}>
          {label}
        </div>
      ) : undefined}

      <CopyFillIcon size={15} />
    </button>
  );
};

export default CopyBtn;
