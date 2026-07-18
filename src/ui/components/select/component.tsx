import { useEffect, useRef, useState } from "react";
import cn from "classnames";
import { CheckIcon, CaretDownBoldIcon } from "@/ui/icons/phosphor";

interface Props<T extends string> {
  setSelected: (data: { name: T }) => void;
  values: { name: string }[];
  selected: any;
  label?: string;
  displayCheckIcon?: boolean;
  className?: string;
  anchor?: "bottom" | "top";
}

/** espo-style custom dropdown (b8 .dropdown component; never a native select). */
const Select = <T extends string>({
  selected,
  setSelected,
  values,
  label,
  displayCheckIcon = true,
  className,
  anchor = "bottom",
}: Props<T>) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className={className}>
      {label !== undefined ? (
        <div className="field" style={{ marginBottom: 6 }}>
          <label>{label}</label>
        </div>
      ) : undefined}
      <div
        className="dropdown"
        data-open={open ? "1" : "0"}
        ref={rootRef}
        style={{ width: "100%" }}
      >
        <button
          type="button"
          className="dropdown-trigger"
          style={{ width: "100%" }}
          onClick={() => setOpen((p) => !p)}
        >
          <span className="dropdown-label">{selected.name}</span>
          <span className="dropdown-caret">
            <CaretDownBoldIcon size={14} />
          </span>
        </button>
        <div
          className="dropdown-panel"
          style={
            anchor === "top"
              ? { top: "auto", bottom: "calc(100% + 8px)", width: "100%" }
              : { width: "100%" }
          }
        >
          {values.map((value, valueIdx) => (
            <button
              type="button"
              key={valueIdx}
              className={cn("dropdown-item", {
                selected: value.name === selected.name,
              })}
              onClick={() => {
                setSelected(value as { name: T });
                setOpen(false);
              }}
            >
              {displayCheckIcon && value.name === selected.name ? (
                <CheckIcon size={14} />
              ) : undefined}
              <span className="dropdown-label">{value.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Select;
