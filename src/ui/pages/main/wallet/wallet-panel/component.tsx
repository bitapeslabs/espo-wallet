import s from "../styles.module.scss";
import { Link, useNavigate } from "react-router-dom";
import {
  useGetCurrentAccount,
  useGetCurrentWallet,
} from "@/ui/states/walletState";
import { shortAddress } from "@/shared/utils/transactions";
import CopyBtn from "@/ui/components/copy-btn";
import NetworkSwitcher from "@/ui/components/network-switcher";
import { CaretRightBoldIcon, GearSixFillIcon } from "@/ui/icons/phosphor";

const WalletPanel = () => {
  const currentWallet = useGetCurrentWallet();
  const currentAccount = useGetCurrentAccount();
  const navigate = useNavigate();

  return (
    <div className={s.topBar}>
      <div className={s.walletLeft}>
        <NetworkSwitcher />
        <div
          className={s.walletWidget}
          onClick={() => navigate("/manage-wallets")}
        >
        <div className={s.walletMeta}>
          <span className={s.walletName}>
            {currentWallet?.name ?? "Wallet"}
          </span>
          <span className={s.walletAddr}>
            {shortAddress(currentAccount?.address, 6)}
            <span
              className={s.walletCopyWrap}
              onClick={(e) => e.stopPropagation()}
            >
              <CopyBtn
                value={currentAccount?.address}
                className={s.walletCopy}
              />
            </span>
          </span>
        </div>
          <CaretRightBoldIcon size={14} className={s.walletCaret} />
        </div>
      </div>

      <Link
        to={"/pages/settings"}
        className={s.topAction}
      >
        <GearSixFillIcon size={19} />
      </Link>
    </div>
  );
};

export default WalletPanel;
