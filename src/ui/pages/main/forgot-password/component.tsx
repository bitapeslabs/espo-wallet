import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "i18next";
import { useForm } from "react-hook-form";
import s from "./styles.module.scss";
import { LockFillIcon, CaretLeftBoldIcon } from "@/ui/icons/phosphor";
import Drawer from "@/ui/components/drawer";
import { useControllersState } from "@/ui/states/controllerState";
import { useAppState } from "@/ui/states/appState";
import { useWalletState } from "@/ui/states/walletState";
import { ss } from "@/ui/utils";
import { isWipeConfirmed, WIPE_CONFIRM_PHRASE } from "@/shared/validators";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wiping, setWiping] = useState(false);
  const { register, watch } = useForm<{ confirm: string }>({
    defaultValues: { confirm: "" },
  });
  const confirmValue = watch("confirm");
  const canWipe = isWipeConfirmed(confirmValue);

  const { walletController } = useControllersState(ss(["walletController"]));
  const { updateAppState } = useAppState(ss(["updateAppState"]));
  const { updateWalletState } = useWalletState(ss(["updateWalletState"]));

  const wipe = async () => {
    if (!canWipe || wiping) return;
    setWiping(true);
    await walletController.wipeWallet();
    await updateWalletState({ wallets: [], vaultIsEmpty: true }, false);
    await updateAppState(
      { isUnlocked: false, password: undefined },
      false
    );
    navigate("/account/welcome");
  };

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate("/account/login")}
        >
          <CaretLeftBoldIcon size={18} />
        </button>
        <div className={s.headerTitle}>
          <span>{t("login.forgot_password")}</span>
        </div>
      </div>

      <div className={s.body}>
        <div className={s.iconCircle}>
          <LockFillIcon size={38} />
        </div>
        <h1 className={s.title}>{t("login.forgot_password")}</h1>
        <p className={s.desc}>{t("forgot.description")}</p>
      </div>

      <button
        className={`btn ${s.wipeBtn}`}
        onClick={() => setDrawerOpen(true)}
      >
        {t("forgot.wipe_wallet")}
      </button>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t("forgot.wipe_wallet")}
      >
        <p className={s.drawerDesc}>{t("forgot.wipe_warning")}</p>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t("forgot.type_confirm")}</label>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={WIPE_CONFIRM_PHRASE}
            {...register("confirm")}
          />
        </div>
        <button
          className="btn danger"
          disabled={!canWipe || wiping}
          onClick={wipe}
        >
          {t("forgot.wipe_wallet")}
        </button>
      </Drawer>
    </div>
  );
};

export default ForgotPassword;
