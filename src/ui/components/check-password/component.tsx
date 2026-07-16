import { FC, useId } from "react";
import s from "./styles.module.scss";
import { useAppState } from "@/ui/states/appState";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { t } from "i18next";
import { ss } from "@/ui/utils";
import { isPasswordEntered } from "@/shared/validators";
import { WarningIcon } from "@/ui/icons/phosphor";

interface Props {
  handler: (password?: string) => void;
}

interface FormType {
  password: string;
}

const CheckPassword: FC<Props> = ({ handler }) => {
  const { password: appPassword } = useAppState(ss(["password"]));

  const pwdId = useId();

  const { register, handleSubmit, watch } = useForm<FormType>();
  const canSubmit = isPasswordEntered(watch("password") ?? "");

  const checkPassword = ({ password }: FormType) => {
    if (password !== appPassword)
      return toast.error(
        t("components.check_password.incorrect_password_error")
      );
    handler(password);
  };

  return (
    <form className={s.form} onSubmit={handleSubmit(checkPassword)}>
      <div className="field">
        <label htmlFor={pwdId}>
          {t("components.check_password.password")}
        </label>
        <input
          id={pwdId}
          type="password"
          {...register("password")}
        />
      </div>

      <div className="inline-notice">
        <span className={s.warning}>
          <WarningIcon size={18} />
          {t("components.check_password.warning")}
        </span>
      </div>

      <button className="bottom-btn" type="submit" disabled={!canSubmit}>
        {t("components.check_password.continue")}
      </button>
    </form>
  );
};

export default CheckPassword;
