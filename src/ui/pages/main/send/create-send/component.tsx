import { useCreateTransferCallback } from "@/ui/hooks/transactions";
import {
  useEffect,
  useMemo,
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
import AssetCard from "@/ui/components/asset-card";
import NetworkIcon from "@/ui/components/network-icon";
import AlkaneIcon from "@/ui/components/alkane-icon";
import { getAddressType, normalizeAmount, ss } from "@/ui/utils";
import { validateSendForm, toRawAmount } from "./validate";
import { formatAlkaneAmount, formatUsdPrice } from "@/shared/utils/alkanes";
import type { IPortfolioAsset } from "@/shared/interfaces/api";
import { t } from "i18next";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";

interface FormType {
  address: string;
  amount: string;
  feeAmount: number;
}

const CreateSend = () => {
  const formId = useId();

  const [isOpenModal, setOpenModal] = useState<boolean>(false);
  const [isSaveAddress, setIsSaveAddress] = useState<boolean>(false);
  const [formData, setFormData] = useState<FormType>({
    address: "",
    amount: "",
    feeAmount: 10,
  });
  const currentAccount = useGetCurrentAccount();
  const createTransfer = useCreateTransferCallback();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState<boolean>(false);
  const { network, addressBook } = useAppState(ss(["network", "addressBook"]));
  // Already-saved recipient (picked from, or matching, the address book): no
  // point offering to save it again.
  const isAddressSaved = addressBook.includes((formData.address ?? "").trim());
  const { portfolio } = useAssetManagerContext();

  // The asset being sent: passed via navigation (BTC or an alkane), else a
  // BTC fallback built from the portfolio / current account.
  const sendAsset: IPortfolioAsset = useMemo(() => {
    const passed = location.state?.sendAsset as IPortfolioAsset | undefined;
    if (passed) return passed;
    const btcSats = portfolio?.btc
      ? Number(portfolio.btc.balance)
      : currentAccount?.balance ?? 0;
    return (
      portfolio?.btc ?? {
        id: "btc",
        name: t("wallet_page.bitcoin"),
        symbol: "BTC",
        balance: String(btcSats),
        priceUsd: null,
        valueUsd: null,
        change24h: null,
        valueChangeUsd24h: null,
      }
    );
  }, [location.state?.sendAsset, portfolio?.btc, currentAccount?.balance]);

  const isBtc = sendAsset.id === "btc";

  // USD estimate of the entered amount (only when the asset has a live price).
  const usdValue = useMemo(() => {
    const price = sendAsset.priceUsd;
    if (price == null) return null;
    const amt = parseFloat(formData.amount);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return amt * price;
  }, [sendAsset.priceUsd, formData.amount]);

  const rawBalance = useMemo(() => {
    try {
      return BigInt(sendAsset.balance || "0");
    } catch {
      return 0n;
    }
  }, [sendAsset.balance]);

  // Whole-form zod validation: gates Continue and drives the red input borders.
  const validation = useMemo(
    () =>
      validateSendForm(formData.address, formData.amount, network, rawBalance),
    [formData.address, formData.amount, network, rawBalance]
  );

  const send = async ({ address, amount: amountStr, feeAmount: feeRate }: FormType) => {
    try {
      setLoading(true);

      if (!address || address.trim().length <= 0) {
        return toast.error(t("send.create_send.address_error"));
      }
      if (typeof getAddressType(address, network) === "undefined") {
        return toast.error(t("send.create_send.address_error"));
      }

      const rawAmount = toRawAmount(normalizeAmount(amountStr));
      if (rawAmount <= 0n) {
        return toast.error(t("send.create_send.minimum_amount_error"));
      }
      if (feeRate % 1 !== 0) {
        return toast.error(t("send.create_send.fee_is_text_error"));
      }
      if (typeof feeRate !== "number" || !feeRate || feeRate < 1) {
        return toast.error(t("send.create_send.not_enough_fee_error"));
      }
      if (rawAmount > rawBalance) {
        return toast.error(
          t("send.create_send.not_enough_money_error", {
            token: sendAsset.name || sendAsset.symbol,
          })
        );
      }

      let data;
      try {
        data = await createTransfer(sendAsset.id, address, rawAmount, feeRate);
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
          sendAsset,
          symbol: sendAsset.symbol.toUpperCase(),
          toAddress: address,
          amount: normalizeAmount(amountStr),
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

  // Restore the form when returning from the confirm screen.
  useEffect(() => {
    if (!currentAccount?.address) return;
    if (location.state?.toAddress) {
      setFormData((prev) => {
        if (prev.address !== "") return prev;
        if (location.state.save) setIsSaveAddress(true);
        return {
          address: location.state.toAddress,
          amount: location.state.amount ?? "",
          feeAmount: location.state.inputedFee ?? prev.feeAmount,
        };
      });
    }
  }, [location.state, currentAccount]);

  const onAmountChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    setFormData((prev) => ({ ...prev, amount: normalizeAmount(e.target.value) }));
  };

  const onMaxClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    // BTC needs headroom for the fee (paid from extra sats); alkanes send the
    // whole balance since the fee is covered separately in BTC.
    const reserve = isBtc ? BigInt(Math.ceil(formData.feeAmount * 300)) : 0n;
    const max = rawBalance > reserve ? rawBalance - reserve : 0n;
    setFormData((prev) => ({ ...prev, amount: formatAlkaneAmount(max.toString()) }));
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
        <div className={s.balanceCard}>
          <AssetCard
            asset={sendAsset}
            network={network}
            fallbackName={t("wallet_page.bitcoin")}
            amountLabel={t("send.create_send.available_balance")}
          />
        </div>

        <div className={s.inputs}>
          <div className="form-field">
            <span className="input-span">{t("send.create_send.address")}</span>
            <AddressInput
              address={formData.address}
              onChange={(v) => setFormData((p) => ({ ...p, address: v }))}
              onOpenModal={() => setOpenModal(true)}
              error={validation.addressError}
            />
          </div>
          <div className="form-field">
            <span className="input-span">{t("send.create_send.amount")}</span>
            <div className={s.amountRow}>
              <div className={s.amountField}>
                <span
                  className={cn("alk-icon-wrap", s.amountIcon)}
                  aria-hidden="true"
                >
                  {isBtc ? (
                    <NetworkIcon network={network} size={24} />
                  ) : (
                    <AlkaneIcon id={sendAsset.id} symbol={sendAsset.symbol} />
                  )}
                </span>
                <input
                  type="number"
                  placeholder={t("send.create_send.amount_to_send")}
                  className={cn("input", s.amountInput, {
                    inputError: validation.amountError,
                  })}
                  value={formData.amount}
                  onChange={onAmountChange}
                />
              </div>
              <button className="btn ghost" onClick={onMaxClick}>
                {t("send.create_send.max_amount")}
              </button>
            </div>
            {usdValue != null ? (
              <span className={s.usdHint}>≈ ${formatUsdPrice(usdValue)}</span>
            ) : undefined}
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

          {!isAddressSaved ? (
            <Switch
              label={t(
                "send.create_send.save_address_for_the_next_payments_label"
              )}
              value={isSaveAddress}
              onChange={setIsSaveAddress}
              locked={false}
            />
          ) : undefined}
        </div>
      </form>

      <div>
        <button
          disabled={loading || !validation.canSubmit}
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
