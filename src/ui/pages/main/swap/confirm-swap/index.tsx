import { useMemo } from "react";
import { t } from "i18next";
import { useLocation, useNavigate } from "react-router-dom";
import type { ActivityKind, IActivityEntry } from "@/shared/interfaces/api";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import OverviewLayout from "@/ui/components/overview-layout";

/**
 * Review screen for a swap / wrap / unwrap. A BTC<->token swap is a CPFP
 * package of two transactions, so the overview card shows a segmented control
 * to inspect each one before confirming; confirming hands the whole package to
 * the result screen, which broadcasts parent-then-child.
 */
const ConfirmSwap = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));

  const hexes = (location.state?.hexes as string[] | undefined) ?? [];
  const labels = (location.state?.labels as string[] | undefined) ?? [];
  const kind = (location.state?.kind as ActivityKind | undefined) ?? "buy";
  const assetId = (location.state?.assetId as string | undefined) ?? "btc";
  const symbol = (location.state?.symbol as string | undefined) ?? "BTC";
  const headerName = (location.state?.headerName as string | undefined) ?? "";

  const rawTxs = useMemo(
    () => hexes.map((hex, i) => ({ hex, label: labels[i] })),
    [hexes, labels]
  );

  const entry: IActivityEntry = useMemo(
    () => ({
      txid: "",
      kind,
      timestamp: 0,
      confirmed: true,
      success: true,
      legs: [{ assetId, delta: "0" }],
    }),
    [kind, assetId]
  );

  return (
    <OverviewLayout
      entry={entry}
      network={network}
      sym={() => symbol}
      headerName={headerName}
      rawTxs={rawTxs}
      fromAddress={currentAccount?.address}
      feeRate={location.state?.feeRate}
      actionLabel={t("send.confirm_send.confirm")}
      onAction={() =>
        navigate("/pages/finalle-send", {
          state: { hexes, kind, optimistic: location.state?.optimistic },
        })
      }
    />
  );
};

export default ConfirmSwap;
