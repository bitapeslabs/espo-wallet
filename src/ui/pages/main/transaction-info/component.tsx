import { useCallback, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { t } from "i18next";
import type {
  ActivityKind,
  IActivityEntry,
} from "@/shared/interfaces/api";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { ss } from "@/ui/utils";
import {
  alkaneSymbol,
  formatSignedAlkaneAmount,
} from "@/shared/utils/alkanes";
import { explorerTxUrl, networkSlug } from "@/shared/networks";
import {
  getLocalPendingRawTx,
  getLocalPendingRawTxs,
} from "@/ui/utils/local-feed";
import { browserTabsCreate } from "@/shared/utils/browser";
import OverviewLayout from "@/ui/components/overview-layout";

/** Header label per activity kind (a noun, unlike the feed's past-tense). */
const KIND_LABEL: Record<ActivityKind, string> = {
  buy: "swap",
  sell: "swap",
  wrap: "wrap",
  unwrap: "unwrap",
  split: "split",
  send: "sent",
  receive: "received",
  liquidity_add: "add_liquidity",
  liquidity_remove: "remove_liquidity",
  pool_create: "create_pool",
  mint: "mint",
  other: "app_interaction",
};

/**
 * Activity-entry overview: the same reusable overview page used by the send
 * review, driven by a confirmed/pending txid and opening espo on action.
 */
const TransactionInfo = () => {
  const currentAccount = useGetCurrentAccount();
  const { state } = useLocation();
  const { txId } = useParams();
  const { network, explorerUrl } = useAppState(ss(["network", "explorerUrl"]));
  const { portfolio } = useAssetManagerContext();

  const activity = state?.activity as IActivityEntry | undefined;
  const entry: IActivityEntry = activity ?? {
    txid: txId ?? "",
    kind: "other",
    timestamp: 0,
    confirmed: true,
    success: true,
    legs: [],
  };

  const symbolMap = useMemo(() => {
    const m = new Map<string, string>();
    portfolio?.alkanes.forEach((a) => m.set(a.id, a.symbol.toUpperCase()));
    return m;
  }, [portfolio]);
  const sym = useCallback(
    (id: string) => {
      if (id === "btc") return portfolio?.btc?.symbol?.toUpperCase() ?? "BTC";
      const symbol = alkaneSymbol(id, symbolMap);
      return symbol.toLowerCase() === "frbtc" ? "frBTC" : symbol;
    },
    [portfolio, symbolMap]
  );

  // "Transfer 5.67 DIESEL", "Swap 1.2 BTC", "App interaction", …
  const primaryLeg = entry.legs[0];
  const amountStr = primaryLeg
    ? formatSignedAlkaneAmount(primaryLeg.delta).text
    : "";
  const symStr = primaryLeg ? sym(primaryLeg.assetId) : "";
  const headerName = [
    t(`transaction_info.kind.${KIND_LABEL[entry.kind]}`),
    amountStr,
    symStr,
  ]
    .filter(Boolean)
    .join(" ");

  // A tx this wallet just broadcast has its raw hex stored locally; the
  // overview renders from it until espo indexes the txid.
  const localRawTx = useMemo(
    () =>
      txId && currentAccount?.address
        ? getLocalPendingRawTx(
            networkSlug(network),
            currentAccount.address,
            txId
          )
        : undefined,
    [txId, currentAccount?.address, network]
  );

  // The OTHER locally-broadcast hexes: a package sibling may be this tx's
  // parent, and the overview chains its projected vouts into these vins.
  const localChainCandidates = useMemo(
    () =>
      txId && currentAccount?.address
        ? getLocalPendingRawTxs(networkSlug(network), currentAccount.address)
            .filter((p) => p.txid !== txId)
            .map((p) => p.rawTx)
        : undefined,
    [txId, currentAccount?.address, network]
  );

  const openEspo = () => {
    if (!txId) return;
    browserTabsCreate({
      url: explorerTxUrl(network, txId, explorerUrl?.[networkSlug(network)]),
      active: true,
    }).catch(console.error);
  };

  return (
    <OverviewLayout
      entry={entry}
      network={network}
      sym={sym}
      headerName={headerName}
      txid={txId}
      rawTx={localRawTx}
      chainRawTxs={localChainCandidates}
      fromAddress={currentAccount?.address}
      actionLabel={t("transaction_info.view_on_espo")}
      onAction={openEspo}
      actionExternal
    />
  );
};

export default TransactionInfo;
