import { useAppState } from "@/ui/states/appState";
import PasswordInput from "@/ui/components/password-input";
import PasswordMeter from "@/ui/components/password-meter";
import { CaretLeftBoldIcon } from "@/ui/icons/phosphor";
import Breadcrumbs from "@/ui/components/breadcrumbs";
import { ONBOARDING_NEXT_KEY } from "@/ui/pages/main/welcome/component";
import { createPasswordSchema } from "@/shared/validators";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { t } from "i18next";
import { ss } from "@/ui/utils";
import { useWalletState } from "@/ui/states/walletState";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import s from "./styles.module.scss";

interface FormType {
  password: string;
  confirmPassword: string;
}

const FLOW_STEPS: Record<string, string[]> = {
  "/pages/new-mnemonic": [
    "components.breadcrumbs.password",
    "components.breadcrumbs.recovery_phrase",
    "components.breadcrumbs.preferences",
  ],
  "/pages/restore-mnemonic": [
    "components.breadcrumbs.password",
    "components.breadcrumbs.import_phrase",
    "components.breadcrumbs.preferences",
  ],
  "/pages/restore-priv-key": [
    "components.breadcrumbs.password",
    "components.breadcrumbs.private_key",
    "components.breadcrumbs.preferences",
  ],
};

const FLOW_TITLES: Record<string, string> = {
  "/pages/new-mnemonic": "new_wallet.new_mnemonic_label",
  "/pages/restore-mnemonic": "new_wallet.import_wallet_label",
  "/pages/restore-priv-key": "new_wallet.import_wallet_label",
};

const CreatePassword = () => {
  const navigate = useNavigate();
  const flow = sessionStorage.getItem(ONBOARDING_NEXT_KEY) ?? "";
  const steps = (FLOW_STEPS[flow] ?? []).map((k) => t(k));
  const headerTitle = t(
    FLOW_TITLES[flow] ?? "create_password.create_password"
  );

  const { register, handleSubmit, watch } = useForm<FormType>({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
  });
  const { updateAppState } = useAppState(ss(["updateAppState"]));
  const { vaultIsEmpty } = useWalletState(ss(["vaultIsEmpty"]));

  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const validation = createPasswordSchema.safeParse({
    password,
    confirmPassword,
  });
  const mismatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  useEffect(() => {
    if (!vaultIsEmpty) navigate("/account/login");
  }, [vaultIsEmpty, navigate]);

  const createPassword = async ({ confirmPassword, password }: FormType) => {
    const parsed = createPasswordSchema.safeParse({
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      toast.error(t("create_password.passwords_mismatch"));
      return;
    }
    await updateAppState({ password: parsed.data.password, isUnlocked: true });
  };

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate("/account/welcome")}
        >
          <CaretLeftBoldIcon size={18} />
        </button>
        <div className={s.headerTitle}>
          <span>{headerTitle}</span>
        </div>
      </div>
      <div className={s.content}>
        <Breadcrumbs steps={steps} current={0} className={s.crumbs} />
        <form className={s.inner} onSubmit={handleSubmit(createPassword)}>
          <h1 className={s.title}>{t("create_password.create_password")}</h1>
          <PasswordInput
            tabIndex={1}
            showSeparateLabel={false}
            register={register}
            label={t("create_password.password")}
            name="password"
          />
          <PasswordMeter password={password} />

          <PasswordInput
            tabIndex={2}
            showSeparateLabel={false}
            register={register}
            label={t("create_password.confirm_password")}
            name="confirmPassword"
          />
          {mismatch ? (
            <p className="field-error">
              {t("create_password.passwords_mismatch")}
            </p>
          ) : undefined}

          <button
            className={`btn ${s.submit}`}
            type="submit"
            disabled={!validation.success}
          >
            {t("create_password.create_password")}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreatePassword;
