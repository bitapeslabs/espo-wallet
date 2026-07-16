import { FC } from "react";
import cn from "classnames";

interface Props {
  locked?: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}

/** espo-style switch (b8 .switch component). */
const SwitchComponent: FC<Props> = ({
  locked,
  onChange,
  value,
  label,
  className,
  disabled,
}) => {
  return (
    <label className={cn("switch", className)}>
      <input
        type="checkbox"
        className="switch-input"
        checked={value}
        disabled={disabled || locked}
        onChange={(e) => {
          if (locked) return;
          onChange(e.target.checked);
        }}
      />
      <span className="switch-slider" />
      <span className="switch-label">{label}</span>
    </label>
  );
};

export default SwitchComponent;
