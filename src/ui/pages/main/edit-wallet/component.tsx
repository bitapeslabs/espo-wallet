import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { t } from "i18next";
import toast from "react-hot-toast";
import s from "./styles.module.scss";
import { useWalletState } from "@/ui/states/walletState";
import { useSwitchWallet, useDeleteWallet } from "@/ui/hooks/wallet";
import { ss } from "@/ui/utils";
import Rename from "@/ui/components/rename";
import Modal from "@/ui/components/modal";
import { CaretLeftBoldIcon, CaretRightBoldIcon } from "@/ui/icons/phosphor";

const EditWallet = () => {
  const navigate = useNavigate();
  const { walletId } = useParams();
  const id = Number(walletId);
  const { wallets, updateWallet } = useWalletState(
    ss(["wallets", "updateWallet"])
  );
  const switchWallet = useSwitchWallet();
  const deleteWallet = useDeleteWallet();

  const wallet = wallets.find((w) => w.id === id);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!wallet) {
    navigate("/manage-wallets");
    return null;
  }

  const onRename = async (name: string) => {
    if (wallets.some((w) => w.id !== id && w.name === name)) {
      return toast.error(t("switch_account.name_already_taken_error"));
    }
    await updateWallet(id, { name });
    setRenaming(false);
  };

  const goWithWallet = async (route: string) => {
    await switchWallet(id, false);
    navigate(route);
  };

  const onDelete = async () => {
    setConfirmDelete(false);
    if (wallets.length <= 1) {
      return toast.error(t("switch_wallet.last_wallet_error"));
    }
    await deleteWallet(id);
    navigate("/manage-wallets");
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
        <span className={s.headerTitle}>{t("edit_wallet.title")}</span>
        <span className={s.spacer} />
      </div>

      <div className={s.body}>
        <div className={s.card}>
          <button className={s.row} onClick={() => setRenaming(true)}>
            <span className={s.rowLabel}>{t("edit_wallet.wallet_name")}</span>
            <span className={s.rowValue}>{wallet.name}</span>
            <CaretRightBoldIcon size={16} className={s.rowCaret} />
          </button>
        </div>

        <div className={s.card}>
          <button
            className={s.row}
            onClick={() => goWithWallet("/pages/change-addr-type")}
          >
            <span className={s.rowLabel}>{t("edit_wallet.address_type")}</span>
            <CaretRightBoldIcon size={16} className={s.rowCaret} />
          </button>
          <button
            className={s.row}
            onClick={() => navigate(`/pages/show-mnemonic/${id}`)}
          >
            <span className={s.rowLabel}>{t("edit_wallet.show_mnemonic")}</span>
            <CaretRightBoldIcon size={16} className={s.rowCaret} />
          </button>
          <button
            className={s.row}
            onClick={() => goWithWallet("/pages/advanced")}
          >
            <span className={s.rowLabel}>{t("edit_wallet.advanced")}</span>
            <CaretRightBoldIcon size={16} className={s.rowCaret} />
          </button>
        </div>

        <div className={s.card}>
          <button
            className={`${s.row} ${s.danger}`}
            onClick={() => setConfirmDelete(true)}
          >
            <span className={s.rowLabel}>
              {t("switch_wallet.remove_wallet")}
            </span>
          </button>
        </div>
      </div>

      <Rename
        active={renaming}
        currentName={wallet.name}
        handler={onRename}
        onClose={() => setRenaming(false)}
      />

      <Modal
        onClose={() => setConfirmDelete(false)}
        open={confirmDelete}
        title={t("components.layout.confirmation")}
      >
        <div className={s.confirmBody}>
          <div>{t("switch_wallet.are_you_sure")}</div>
          <span className={s.confirmName}>{wallet.name}</span>
        </div>
        <div className={s.confirmActions}>
          <button className="btn danger" onClick={onDelete}>
            {t("switch_wallet.yes")}
          </button>
          <button
            className="btn ghost"
            onClick={() => setConfirmDelete(false)}
          >
            {t("switch_wallet.no")}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default EditWallet;
