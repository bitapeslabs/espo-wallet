import s from "../styles.module.scss";
import { t } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  useGetCurrentAccount,
  useGetCurrentWallet,
} from "@/ui/states/walletState";
import { shortAddress } from "@/shared/utils/transactions";
import CopyBtn from "@/ui/components/copy-btn";
import { CaretRightIcon, GearSixFillIcon } from "@/ui/icons/phosphor";

const WalletPanel = () => {
  const currentWallet = useGetCurrentWallet();
  const currentAccount = useGetCurrentAccount();
  const navigate = useNavigate();

  return (
    <div className={s.topBar}>
      <div
        className={s.walletWidget}
        onClick={() => navigate("/manage-wallets")}
        title={t("components.layout.switch_account")}
      >
        <div className={s.walletMeta}>
          <span className={s.walletName}>
            {currentWallet?.name ?? "Wallet"}
          </span>
          <span
            className={s.walletAddr}
            onClick={(e) => e.stopPropagation()}
          >
            {shortAddress(currentAccount?.address, 8)}
            <CopyBtn
              title={currentAccount?.address}
              value={currentAccount?.address}
              className={s.walletCopy}
            />
          </span>
        </div>
        <CaretRightIcon size={14} className={s.walletCaret} />
      </div>

      <Link
        to={"/pages/settings"}
        className={s.topAction}
        title={t("components.layout.settings")}
      >
        <GearSixFillIcon size={19} />
      </Link>
    </div>
  );
};

export default WalletPanel;
