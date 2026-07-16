import { t } from "i18next";
import { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { EyeIcon, EyeSlashIcon } from "@/ui/icons/phosphor";
import { useState } from "react";

const PasswordInput = <T extends FieldValues>({
  label,
  name,
  register,
  showSeparateLabel = true,
  tabIndex,
}: {
  register: UseFormRegister<T>;
  name: Path<T>;
  label: string;
  showSeparateLabel?: boolean;
  tabIndex?: number;
}) => {
  const [hidden, setHidden] = useState(true);

  return (
    <div className="field">
      {showSeparateLabel ? <label htmlFor={name}>{label}</label> : undefined}
      <div className="pw-wrap">
        <input
          tabIndex={tabIndex ?? 0}
          id={name}
          {...register(name, {
            minLength: {
              value: 1,
              message: t(
                "components.password_input.should_be_more_than_1_symbol"
              ),
            },
            maxLength: {
              value: 70,
              message: t(
                "components.password_input.should_be_less_than_70_symbols"
              ),
            },
            required: {
              value: true,
              message: t("components.password_input.required"),
            },
          })}
          type={hidden ? "password" : "text"}
          className="pw-input"
          placeholder={showSeparateLabel ? "" : label}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={(e) => {
            e.preventDefault();
            setHidden((p) => !p);
          }}
        >
          {hidden ? <EyeIcon size={19} /> : <EyeSlashIcon size={19} />}
        </button>
      </div>
    </div>
  );
};

export default PasswordInput;
