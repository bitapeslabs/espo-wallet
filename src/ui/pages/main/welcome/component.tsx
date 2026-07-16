import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "i18next";
import cn from "classnames";
import { useAppState } from "@/ui/states/appState";
import { useWalletState } from "@/ui/states/walletState";
import { ss } from "@/ui/utils";
import EspoGlyph from "@/ui/icons/EspoGlyph";
import LanguageDropdown from "@/ui/components/language-dropdown";
import s from "./styles.module.scss";

export const ONBOARDING_NEXT_KEY = "espo_onboarding_next";

const Welcome = () => {
  const navigate = useNavigate();
  const { language } = useAppState(ss(["language"]));
  const { vaultIsEmpty } = useWalletState(ss(["vaultIsEmpty"]));

  useEffect(() => {
    // a vault already exists: this is a returning user, send them to unlock
    if (!vaultIsEmpty) navigate("/account/login");
  }, [vaultIsEmpty, navigate]);

  const choose = (route: string) => {
    sessionStorage.setItem(ONBOARDING_NEXT_KEY, route);
    navigate("/account/create-password");
  };

  return (
    <div className={s.wrap}>
      <div className={s.topBar}>
        <LanguageDropdown />
      </div>

      <div className={s.center}>
        <EspoGlyph size={104} bloom className={s.glyph} />
        <p className={cn(s.tagline, { [s.taglineCjk]: language === "ch" })}>
          {t("welcome.tagline")}
        </p>
      </div>

      <div className={s.actions}>
        <button className="btn" onClick={() => choose("/pages/new-mnemonic")}>
          {t("new_wallet.new_mnemonic_label")}
        </button>
        <button
          className="btn ghost"
          onClick={() => navigate("/account/import")}
        >
          {t("new_wallet.import_wallet_label")}
        </button>
      </div>
    </div>
  );
};

export default Welcome;
