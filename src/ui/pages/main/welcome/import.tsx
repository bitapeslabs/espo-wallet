import { useNavigate } from "react-router-dom";
import { t } from "i18next";
import Tile from "@/ui/components/tile";
import { CaretLeftBoldIcon, GlobeIcon, KeyIcon } from "@/ui/icons/phosphor";
import { ONBOARDING_NEXT_KEY } from "./component";
import s from "./import.module.scss";

const ImportWallet = () => {
  const navigate = useNavigate();

  const choose = (route: string) => {
    sessionStorage.setItem(ONBOARDING_NEXT_KEY, route);
    navigate("/account/create-password");
  };

  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={s.back}
        onClick={() => navigate("/account/welcome")}
      >
        <CaretLeftBoldIcon size={18} />
      </button>

      <div className={s.inner}>
        <h1 className={s.title}>{t("new_wallet.import_wallet_label")}</h1>
        <div className={s.choices}>
          <Tile
            icon={<GlobeIcon size={20} />}
            label={t("new_wallet.restore_mnemonic_label")}
            onClick={() => choose("/pages/restore-mnemonic")}
          />
          <Tile
            icon={<KeyIcon size={20} />}
            label={t("new_wallet.restore_from_private_key_label")}
            onClick={() => choose("/pages/restore-priv-key")}
          />
        </div>
      </div>
    </div>
  );
};

export default ImportWallet;
