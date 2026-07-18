import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { t } from "i18next";
import toast from "react-hot-toast";
import s from "../edit-wallet/styles.module.scss";
import { useWalletState } from "@/ui/states/walletState";
import { useSwitchWallet } from "@/ui/hooks/wallet";
import { ss } from "@/ui/utils";
import Rename from "@/ui/components/rename";
import { CaretLeftBoldIcon, CaretRightBoldIcon } from "@/ui/icons/phosphor";

/** Per-account settings from Manage Wallets: rename + export its private key. */
const EditAccount = () => {
  const navigate = useNavigate();
  const { walletId, accountId } = useParams();
  const wid = Number(walletId);
  const aid = Number(accountId);
  const { wallets, updateAccount } = useWalletState(
    ss(["wallets", "updateAccount"])
  );
  const switchWallet = useSwitchWallet();

  const wallet = wallets.find((w) => w.id === wid);
  const accountIndex = wallet?.accounts.findIndex((a) => a.id === aid) ?? -1;
  const account = accountIndex >= 0 ? wallet?.accounts[accountIndex] : undefined;
  const [renaming, setRenaming] = useState(false);

  if (!wallet || !account) {
    navigate("/manage-wallets");
    return null;
  }

  const onRename = async (name: string) => {
    if (wallet.accounts.some((a) => a.id !== aid && a.name === name.trim())) {
      return toast.error(t("switch_account.name_already_taken_error"));
    }
    await updateAccount(wid, aid, { name });
    setRenaming(false);
  };

  // show-pk resolves the account from the CURRENT wallet by index, so switch to
  // this account's wallet first, then reveal (behind the password check).
  const exportKey = async () => {
    await switchWallet(wid, false);
    navigate(`/pages/show-pk/${accountIndex}`);
  };

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate(-1)}
        >
          <CaretLeftBoldIcon size={18} />
        </button>
        <span className={s.headerTitle}>{t("edit_account.title")}</span>
        <span className={s.spacer} />
      </div>

      <div className={s.body}>
        <div className={s.card}>
          <button className={s.row} onClick={() => setRenaming(true)}>
            <span className={s.rowLabel}>{t("edit_account.account_name")}</span>
            <span className={s.rowValue}>{account.name}</span>
            <CaretRightBoldIcon size={14} className={s.rowCaret} />
          </button>
        </div>

        <div className={s.card}>
          <button className={s.row} onClick={exportKey}>
            <span className={s.rowLabel}>
              {t("switch_account.export_private_key")}
            </span>
            <CaretRightBoldIcon size={14} className={s.rowCaret} />
          </button>
        </div>
      </div>

      <Rename
        active={renaming}
        currentName={account.name}
        handler={onRename}
        onClose={() => setRenaming(false)}
      />
    </div>
  );
};

export default EditAccount;
