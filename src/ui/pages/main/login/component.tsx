import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "@/ui/states/appState";
import { useWalletState } from "@/ui/states/walletState";
import { useControllersState } from "@/ui/states/controllerState";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { isNotification, ss } from "@/ui/utils";
import PasswordInput from "@/ui/components/password-input";
import EspoGlyph from "@/ui/icons/EspoGlyph";
import LanguageDropdown from "@/ui/components/language-dropdown";
import { t } from "i18next";
import { isPasswordEntered } from "@/shared/validators";
import s from "./styles.module.scss";

interface FormType {
  password: string;
}

const Login = () => {
  const { register, handleSubmit, watch } = useForm<FormType>({
    defaultValues: {
      password: "",
    },
  });
  const { updateAppState } = useAppState(ss(["updateAppState"]));

  const { vaultIsEmpty, updateWalletState } = useWalletState(
    ss(["vaultIsEmpty", "updateWalletState"])
  );
  const navigate = useNavigate();
  const { walletController, notificationController } = useControllersState(
    ss(["walletController", "notificationController"])
  );

  useEffect(() => {
    if (vaultIsEmpty) navigate("/account/welcome");
  }, [vaultIsEmpty, navigate]);

  const login = async ({ password }: FormType) => {
    try {
      const exportedWallets = await walletController.importWallets(password);

      await updateWalletState({
        wallets: exportedWallets,
      });
      await updateAppState({
        isUnlocked: true,
        password: password,
      });
      if (isNotification()) await notificationController.resolveApproval();
    } catch (e) {
      if ((e as Error).message) toast.error((e as Error).message);
      else throw e;
    }
  };

  return (
    <form className={s.wrap} onSubmit={handleSubmit(login)}>
      <div className={s.topBar}>
        <LanguageDropdown />
      </div>

      <div className={s.upper}>
        <EspoGlyph size={104} bloom className={s.glyph} />
      </div>

      <div className={s.group}>
        <p className={s.title}>{t("login.enter_password")}</p>
        <div className={s.inputWrap}>
          <PasswordInput
            showSeparateLabel={false}
            register={register}
            label={t("login.password")}
            name="password"
          />
        </div>
      </div>

      <div className={s.lower} />

      <button
        className={`btn ${s.unlock}`}
        type="submit"
        disabled={!isPasswordEntered(watch("password") ?? "")}
      >
        {t("login.unlock")}
      </button>
      <button
        type="button"
        className={s.forgot}
        onClick={() => navigate("/account/forgot-password")}
      >
        {t("login.forgot_password")}
      </button>
    </form>
  );
};

export default Login;
