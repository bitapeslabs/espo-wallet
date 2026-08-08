import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { t } from "i18next";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import type { IActivityEntry, IPortfolioAsset } from "@/shared/interfaces/api";
import { toRawAmount } from "@/ui/pages/main/send/create-send/validate";
import OverviewLayout from "@/ui/components/overview-layout";

const ConfirmSend = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { network } = useAppState(ss(["network"]));

  const sendAsset = location.state?.sendAsset as IPortfolioAsset | undefined;
  const assetId = sendAsset?.id ?? "btc";
  const symbol = location.state?.symbol ?? "BTC";
  const amount = location.state?.amount ?? "";

  const entry: IActivityEntry = useMemo(
    () => ({
      txid: location.state?.toAddress ?? "",
      kind: "send",
      timestamp: 0,
      confirmed: true,
      success: true,
      legs: [{ assetId, delta: "0" }],
      peer: location.state?.toAddress,
    }),
    [assetId, location.state?.toAddress]
  );

  // The result screen owns the broadcast so it can show its loading animation
  // while the tx is in flight, then flip to the success state.
  const confirmSend = () => {
    setLoading(true);
    // The tx shape is fully known here, so the result screen can drop it into
    // the local feed the instant the broadcast succeeds (before espo indexes).
    let rawAmount = "0";
    try {
      rawAmount = toRawAmount(String(amount)).toString();
    } catch {
      // display-only; the optimistic amount just stays 0
    }
    navigate("/pages/finalle-send", {
      state: {
        hex: location.state.hex,
        save: location.state.save,
        toAddress: location.state.toAddress,
        kind: "send",
        optimistic: [
          {
            kind: "send",
            timestamp: 0,
            confirmed: false,
            success: true,
            legs: [{ assetId, delta: `-${rawAmount}` }],
            peer: location.state.toAddress,
          },
        ],
      },
    });
  };

  return (
    <OverviewLayout
      entry={entry}
      network={network}
      sym={() => symbol}
      headerName={`${t("transaction_info.kind.transfer")} ${amount} ${symbol}`}
      rawTx={location.state.hex}
      fromAddress={location.state.fromAddress}
      feeRate={location.state.inputedFee}
      actionLabel={t("send.confirm_send.confirm")}
      onAction={confirmSend}
      actionDisabled={loading}
    />
  );
};

export default ConfirmSend;
