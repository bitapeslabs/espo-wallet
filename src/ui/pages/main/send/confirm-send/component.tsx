import { usePushBtcTxCallback } from "@/ui/hooks/transactions";
import s from "./styles.module.scss";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useUpdateAddressBook } from "@/ui/hooks/app";
import { t } from "i18next";
import { useUpdateCurrentAccountBalance } from "@/ui/hooks/wallet";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { useGetCurrentAccount } from "@/ui/states/walletState";

const ConfirmSend = () => {
  const location = useLocation();
  const pushTx = usePushBtcTxCallback();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const updateAddressBook = useUpdateAddressBook();
  const updateBalance = useUpdateCurrentAccountBalance();
  const { updateTransactions } = useTransactionManagerContext();
  const currentAccount = useGetCurrentAccount();

  const confirmSend = async () => {
    setLoading(true);
    try {
      const data = await pushTx(location.state.hex);
      if (!data || !data.txid) {
        throw new Error(data?.error ?? "Failed pushing transaction");
      }

      setTimeout(() => {
        updateBalance().catch(console.error);
        if (currentAccount?.address) {
          updateTransactions(currentAccount.address).catch(console.error);
        }
      }, 100);

      navigate(`/pages/finalle-send/${data.txid}`);

      if (location.state.save) {
        await updateAddressBook(location.state.toAddress);
      }
    } catch (e) {
      toast.error((e as Error).message);
      console.error(e);
      navigate(-1);
    }
  };

  const fields = [
    {
      label: t("send.confirm_send.to_addrses"),
      value: location.state.toAddress,
    },
    {
      label: t("send.confirm_send.from_address"),
      value: location.state.fromAddress,
    },
    {
      label: t("send.confirm_send.amount"),
      value: location.state.amount + " BTC",
    },
    {
      label: t("send.confirm_send.fee"),
      value: `${location.state.feeAmount / 10 ** 8} BTC (${
        location.state.includeFeeInAmount
          ? t("send.confirm_send.included")
          : t("send.confirm_send.not_included")
      })`,
    },
  ];

  return (
    <div className={s.wrapper}>
      <div className="panel">
        <div className={s.list}>
          {fields.map((i) => (
            <div key={i.label} className="review-card">
              <div className="stat-label">{i.label}</div>
              <div className="stat-value">{i.value}</div>
            </div>
          ))}
        </div>
      </div>
      <button disabled={loading} className={"bottom-btn"} onClick={confirmSend}>
        {t("send.confirm_send.confirm")}
      </button>
    </div>
  );
};

export default ConfirmSend;
