import { useCallback, useMemo } from "react";
import { t } from "i18next";
import cn from "classnames";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { TailSpin } from "react-loading-icons";

import type { IActivityEntry, IUnwrapRequest } from "@/shared/interfaces/api";
import { useControllersState } from "@/ui/states/controllerState";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useEspoQuery } from "@/ui/utils/query";
import { ss } from "@/ui/utils";
import { alkaneSymbol, formatAlkaneAmount } from "@/shared/utils/alkanes";
import { shortAddress } from "@/shared/utils/transactions";
import FitText from "@/ui/components/fit-text";
import ActivityIcon from "@/ui/pages/main/activity/activity-icon";
import {
  CaretRightBoldIcon,
  SnowflakeBoldIcon,
} from "@/ui/icons/phosphor";
import { unwrapEntry } from "../unwrap-card";
import s from "./styles.module.scss";

/** The lifecycle stage index driving the stepper. */
const STAGE: Record<IUnwrapRequest["state"], number> = {
  unconfirmed: 0,
  confirmed: 1,
  fulfilled: 2,
};

/**
 * One unwrap request's lifecycle: the activity-style header (pair icon +
 * "Unwrap X BTC"), a progress bar over the three states, and the two
 * transactions involved - the unwrap itself and the signer's fulfillment
 * payout. Each becomes clickable once it exists on-chain.
 */
const UnwrapInfo = () => {
  const { txId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const { portfolio } = useAssetManagerContext();
  const currentAccount = useGetCurrentAccount();
  const address = currentAccount?.address;

  const fromState = state?.unwrap as IUnwrapRequest | undefined;

  // Live view of the request: scan the first pages of the espo index for this
  // txid so the page advances (confirmed -> fulfilled) while it is open. Not
  // found = still in the mempool; fall back to what the list row passed in.
  const liveQuery = useEspoQuery(
    ["unwrap-info", address ?? "", txId ?? ""],
    async () => {
      for (let page = 1; page <= 5; page++) {
        const rows = await apiController.getUnwrapRequests(
          address as string,
          page
        );
        if (!rows?.length) break;
        const hit = rows.find((r) => r.txid === txId);
        if (hit) return hit;
        if (rows.length < 20) break;
      }
      return null;
    },
    { enabled: !!address && !!txId, refetchInterval: 10_000 }
  );

  const unwrap: IUnwrapRequest = liveQuery.data ??
    fromState ?? {
      txid: txId ?? "",
      vout: 0,
      timestamp: 0,
      amount: "0",
      state: "unconfirmed",
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

  const entry = unwrapEntry(unwrap);
  const headerName = `${t("transaction_info.kind.unwrap")} ${formatAlkaneAmount(
    unwrap.amount
  )} BTC`;

  const unwrapConfirmed = unwrap.state !== "unconfirmed";
  const fulfilled = unwrap.state === "fulfilled" && !!unwrap.fulfillmentTxid;

  const openUnwrapTx = () => {
    if (!unwrapConfirmed) return;
    navigate(`/pages/transaction-info/${unwrap.txid}`, {
      state: { activity: entry },
    });
  };

  const openFulfillmentTx = () => {
    if (!fulfilled || !unwrap.fulfillmentTxid) return;
    const fulfillment: IActivityEntry = {
      txid: unwrap.fulfillmentTxid,
      kind: "receive",
      timestamp: 0,
      confirmed: true,
      success: true,
      legs: [{ assetId: "btc", delta: unwrap.amount }],
    };
    navigate(`/pages/transaction-info/${unwrap.fulfillmentTxid}`, {
      state: { activity: fulfillment },
    });
  };

  return (
    <div className={s.wrapper}>
      <div className={s.overviewHead}>
        <span className={s.overviewIcon}>
          {/* the stepper below carries the pending state; a spinner up here
              too reads as noise, so the header icon always renders settled */}
          <ActivityIcon
            entry={{ ...entry, confirmed: true }}
            network={network}
            sym={sym}
          />
        </span>
        <FitText
          className={s.overviewKind}
          maxFont={18}
          minFont={12}
          screenMargin={24}
        >
          {headerName}
        </FitText>
      </div>

      <div className={s.steps}>
        {(["unconfirmed", "confirmed", "fulfilled"] as const).map(
          (step, i, all) => {
            const stage = STAGE[unwrap.state];
            // The last stage has nothing after it, so reaching it completes
            // every step (the stepper reads 100%, never a stuck spinner).
            const done = unwrap.state === "fulfilled" || i < stage;
            const current = !done && i === stage;
            const nextReached = unwrap.state === "fulfilled" || i + 1 <= stage;
            return (
              <div
                key={step}
                className={cn(s.step, {
                  [s.stepLineOn]: i < all.length - 1 && nextReached,
                })}
              >
                <span
                  className={cn(s.stepCircle, {
                    [s.stepDone]: done,
                    [s.stepCurrent]: current,
                  })}
                />
                <span
                  className={cn(s.stepLabel, {
                    [s.stepLabelUpcoming]: !done && !current,
                  })}
                >
                  {t(`unwraps.state_${step}`)}
                </span>
              </div>
            );
          }
        )}
      </div>

      <div className={s.txs}>
        <div
          className={cn(s.txRow, { [s.txRowDisabled]: !unwrapConfirmed })}
          onClick={openUnwrapTx}
        >
          <ActivityIcon entry={entry} network={network} sym={sym} />
          <div className={s.txMain}>
            <span className={s.txTitle}>
              {t("transaction_info.kind.unwrap")}
            </span>
            <span className={s.txSub}>{shortAddress(unwrap.txid, 6)}</span>
          </div>
          {unwrapConfirmed ? (
            <CaretRightBoldIcon size={14} className={s.txCaret} />
          ) : undefined}
        </div>

        <div
          className={cn(s.txRow, { [s.txRowDisabled]: !fulfilled })}
          onClick={openFulfillmentTx}
        >
          <span className={s.flakeWrap}>
            <span className={s.flakeIcon}>
              <SnowflakeBoldIcon size={18} />
            </span>
            {!fulfilled ? (
              <span className={s.cardBadge}>
                <TailSpin className={s.cardBadgeSpin} strokeWidth={6} />
              </span>
            ) : undefined}
          </span>
          <div className={s.txMain}>
            <span className={s.txTitle}>
              {fulfilled
                ? t("unwraps.fulfillment")
                : t("unwraps.pending_fulfillment")}
            </span>
            {fulfilled && unwrap.fulfillmentTxid ? (
              <span className={s.txSub}>
                {shortAddress(unwrap.fulfillmentTxid, 6)}
              </span>
            ) : undefined}
          </div>
          {fulfilled ? (
            <CaretRightBoldIcon size={14} className={s.txCaret} />
          ) : undefined}
        </div>
      </div>
    </div>
  );
};

export default UnwrapInfo;
