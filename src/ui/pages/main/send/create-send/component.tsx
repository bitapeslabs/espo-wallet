import { useCreateBtcTxCallback } from "@/ui/hooks/transactions";
import {
  useEffect,
  useState,
  ChangeEventHandler,
  MouseEventHandler,
  useId,
} from "react";
import s from "./styles.module.scss";
import cn from "classnames";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import FeeInput from "./fee-input";
import Switch from "@/ui/components/switch";
import AddressBookModal from "./address-book-modal";
import AddressInput from "./address-input";
import { getAddressType, normalizeAmount, ss } from "@/ui/utils";
import { isSendValid } from "@/shared/validators";
import { t } from "i18next";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";

interface FormType {
  address: string;
  amount: string;
  feeAmount: number;
  includeFeeInAmount: boolean;
}

const CreateSend = () => {
  const formId = useId();

  const [isOpenModal, setOpenModal] = useState<boolean>(false);
  const [isSaveAddress, setIsSaveAddress] = useState<boolean>(false);
  const [formData, setFormData] = useState<FormType>({
    address: "",
    amount: "",
    includeFeeInAmount: false,
    feeAmount: 10,
  });
  const [includeFeeLocked, setIncludeFeeLocked] = useState<boolean>(false);
  const currentAccount = useGetCurrentAccount();
  const createTx = useCreateBtcTxCallback();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState<boolean>(false);
  const { network } = useAppState(ss(["network"]));

  const send = async ({
    address,
    amount: amountStr,
    feeAmount: feeRate,
    includeFeeInAmount,
  }: FormType) => {
    try {
      setLoading(true);
      const balance = currentAccount?.balance ?? 0;
      const amount = parseFloat(amountStr);

      if (typeof getAddressType(address, network) === "undefined") {
        return toast.error(t("send.create_send.address_error"));
      }

      if (Number.isNaN(amount) || amount < 1e-5) {
        return toast.error(t("send.create_send.minimum_amount_error"));
      }
      if (address.trim().length <= 0) {
        return toast.error(t("send.create_send.address_error"));
      }
      if (feeRate % 1 !== 0) {
        return toast.error(t("send.create_send.fee_is_text_error"));
      }
      if (typeof feeRate !== "number" || !feeRate || feeRate < 1) {
        return toast.error(t("send.create_send.not_enough_fee_error"));
      }
      if (amount > balance / 10 ** 8) {
        return toast.error(t("send.create_send.not_enough_money_error"));
      }

      let data;

      try {
        data = await createTx(
          address,
          Number((amount * 10 ** 8).toFixed(0)),
          feeRate,
          includeFeeInAmount
        );
      } catch (e) {
        const error = e as Error;
        if ("message" in error) {
          toast.error(error.message);
        } else {
          console.error(e);
        }
      }

      if (!data) return;
      const { fee, rawtx } = data;

      navigate("/pages/confirm-send", {
        state: {
          toAddress: address,
          amount: normalizeAmount(amountStr),
          includeFeeInAmount,
          fromAddress: currentAccount?.address ?? "",
          feeAmount: fee,
          inputedFee: feeRate,
          hex: rawtx,
          save: isSaveAddress,
        },
      });
    } catch (e) {
      if ((e as Error).message) {
        toast.error((e as Error).message);
      } else {
        toast.error(t("send.create_send.default_error"));
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      !currentAccount ||
      !currentAccount.address ||
      typeof currentAccount.balance === "undefined"
    )
      return;

    if (location.state) {
      setFormData((prev) => {
        if (prev.address === "") {
          if (location.state.toAddress) {
            if (location.state.save) {
              setIsSaveAddress(true);
            }
            if (currentAccount.balance! / 10 ** 8 <= location.state.amount)
              setIncludeFeeLocked(true);

            return {
              address: location.state.toAddress,
              amount: location.state.amount,
              feeAmount: location.state.inputedFee,
              includeFeeInAmount: location.state.includeFeeInAmount,
            };
          }

        }
        return prev;
      });
    }
  }, [location.state, setFormData, currentAccount]);

  const onAmountChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    if (!currentAccount || !currentAccount.address || !currentAccount.balance)
      return;
    setFormData((prev) => ({
      ...prev,
      amount: normalizeAmount(e.target.value),
    }));
    if (currentAccount.balance / 10 ** 8 > Number(e.target.value)) {
      setIncludeFeeLocked(false);
    } else {
      setIncludeFeeLocked(true);
      setFormData((prev) => ({
        ...prev,
        includeFeeInAmount: true,
      }));
    }
  };

  const onMaxClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    if (currentAccount?.balance) {
      setFormData((prev) => ({
        ...prev,
        amount: (currentAccount.balance! / 10 ** 8).toString(),
        includeFeeInAmount: true,
      }));
      setIncludeFeeLocked(true);
    }
  };

  return (
    <div className={s.wrapper}>
      <form
        id={formId}
        className={cn("form", s.send)}
        onSubmit={async (e) => {
          e.preventDefault();
          await send(formData);
        }}
      >
        <div className={s.inputs}>
          <div className="form-field">
            <span className="input-span">{t("send.create_send.address")}</span>
            <AddressInput
              address={formData.address}
              onChange={(v) => setFormData((p) => ({ ...p, address: v }))}
              onOpenModal={() => setOpenModal(true)}
            />
          </div>
          <div className="form-field">
            <span className="input-span">{t("send.create_send.amount")}</span>
            <div className={s.amountRow}>
              <input
                type="number"
                placeholder={t("send.create_send.amount_to_send")}
                className="input"
                value={formData.amount}
                onChange={onAmountChange}
              />
              <button className="btn ghost small" onClick={onMaxClick}>
                {t("send.create_send.max_amount")}
              </button>
            </div>
          </div>
        </div>

        <div className={s.feeDiv}>
          <div className="form-field">
            <span className="input-span">
              {t("send.create_send.fee_label")}
            </span>
            <FeeInput
              onChange={(v) =>
                setFormData((prev) => ({ ...prev, feeAmount: v ?? 0 }))
              }
              value={formData.feeAmount}
            />
          </div>

          <Switch
            label={t("send.create_send.include_fee_in_the_amount_label")}
            onChange={(v) =>
              setFormData((prev) => ({ ...prev, includeFeeInAmount: v }))
            }
            value={formData.includeFeeInAmount}
            locked={includeFeeLocked}
          />

          <Switch
            label={t(
              "send.create_send.save_address_for_the_next_payments_label"
            )}
            value={isSaveAddress}
            onChange={setIsSaveAddress}
            locked={false}
          />
        </div>
      </form>

      <div>
        <div className={s.balanceRow}>
          <div className={s.balanceLabel}>{`${t(
            "wallet_page.amount_in_transactions"
          )}`}</div>
          <span className={s.balanceValue}>
            {`${((currentAccount?.balance ?? 0) / 10 ** 8).toFixed(8)} BTC`}
          </span>
        </div>
        <button
          disabled={loading || !isSendValid(formData.address, formData.amount)}
          type="submit"
          className={"bottom-btn"}
          form={formId}
        >
          {t("send.create_send.continue")}
        </button>
      </div>

      <AddressBookModal
        isOpen={isOpenModal}
        onClose={() => setOpenModal(false)}
        setAddress={(address) => {
          setFormData((p) => ({ ...p, address: address }));
        }}
      />
    </div>
  );
};

export default CreateSend;
