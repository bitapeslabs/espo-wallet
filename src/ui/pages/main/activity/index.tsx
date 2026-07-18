import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "i18next";
import cn from "classnames";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import LoadingIcons, { TailSpin } from "react-loading-icons";
import type { ActivityKind, IActivityEntry } from "@/shared/interfaces/api";
import { useControllersState } from "@/ui/states/controllerState";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { ss } from "@/ui/utils";
import { shortAddress } from "@/shared/utils/transactions";
import { alkaneSymbol, formatSignedAlkaneAmount } from "@/shared/utils/alkanes";
import DateComponent from "@/ui/components/date";
import { ClockBoldIcon } from "@/ui/icons/phosphor";
import ActivityIcon from "./activity-icon";
import ActivityAmount from "./activity-amount";
import s from "./styles.module.scss";

/** Group entries by local day; unconfirmed/unknown-time entries share "0". */
function groupByDay(entries: IActivityEntry[]): [string, IActivityEntry[]][] {
  const map = new Map<string, IActivityEntry[]>();
  for (const e of entries) {
    let key = "0";
    if (e.confirmed && e.timestamp) {
      const d = new Date(e.timestamp * 1000);
      d.setHours(0, 0, 0, 0);
      key = String(d.getTime());
    }
    const bucket = map.get(key);
    if (bucket) bucket.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()];
}

const TITLE_KEY: Record<ActivityKind, string> = {
  buy: "swapped",
  sell: "swapped",
  liquidity_add: "added_liquidity",
  liquidity_remove: "removed_liquidity",
  pool_create: "created_pool",
  mint: "minted",
  send: "sent",
  receive: "received",
  split: "split",
  wrap: "wrapped",
  unwrap: "unwrapped",
  other: "app_interaction",
};

/** The clock tab: a Phantom-style activity feed (swaps, LP, mints, sends). */
const Activity = () => {
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const { portfolio } = useAssetManagerContext();
  const currentAccount = useGetCurrentAccount();
  const address = currentAccount?.address;
  const navigate = useNavigate();

  // Open the in-app transaction overview (which itself links out to the
  // explorer); pass the classified entry so it can show the activity icon +
  // kind, and the page resolves the tx details from history by txid.
  const openTx = (entry: IActivityEntry) =>
    navigate(`/pages/transaction-info/${entry.txid}`, {
      state: { activity: entry },
    });

  const [entries, setEntries] = useState<IActivityEntry[] | undefined>(
    undefined
  );
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const { ref, inView } = useInView();

  // Symbol resolver: prefer the portfolio's names, fall back to known alkanes.
  const symbolMap = useMemo(() => {
    const m = new Map<string, string>();
    portfolio?.alkanes.forEach((a) => m.set(a.id, a.symbol.toUpperCase()));
    return m;
  }, [portfolio]);
  const sym = useCallback(
    (id: string) => {
      if (id === "btc") return portfolio?.btc?.symbol?.toUpperCase() ?? "BTC";
      const s = alkaneSymbol(id, symbolMap);
      // frBTC keeps its canonical mixed-case brand spelling, never uppercased.
      return s.toLowerCase() === "frbtc" ? "frBTC" : s;
    },
    [portfolio, symbolMap]
  );

  useEffect(() => {
    if (!address) return;
    setEntries(undefined);
    setPage(1);
    setHasMore(true);
    apiController
      .getActivity(address, 1)
      .then((res) => {
        setEntries(res ?? []);
        setHasMore((res?.length ?? 0) > 0);
      })
      // Never leave the loader up on failure — resolve to an empty feed.
      .catch(() => setEntries([]));
  }, [address, network, apiController]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !address || entries === undefined) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await apiController.getActivity(address, next);
      if (res && res.length) {
        setEntries((prev) => {
          const seen = new Set((prev ?? []).map((e) => e.txid));
          return [...(prev ?? []), ...res.filter((e) => !seen.has(e.txid))];
        });
        setPage(next);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [apiController, address, entries, hasMore, loadingMore, page]);

  useEffect(() => {
    if (inView) loadMore().catch(console.error);
  }, [inView, loadMore]);

  return (
    <div className={s.activity}>
      <h1 className={s.title}>{t("activity.title")}</h1>

      {entries === undefined ? (
        <div className={s.loaderWrap}>
          <TailSpin className="animate-spin" />
        </div>
      ) : !entries.length ? (
        <div className={s.empty}>
          <ClockBoldIcon size={28} className={s.emptyIcon} />
          <p>{t("activity.no_activity")}</p>
        </div>
      ) : (
        <>
          <div className={s.list}>
            {groupByDay(entries).map(([key, group]) => (
              <div key={key} className={s.group}>
                <div className="review-heading">
                  {key === "0" ? (
                    t("wallet_page.unconfirmed")
                  ) : (
                    <DateComponent date={Number(key)} />
                  )}
                </div>
                <div className={s.rows}>
                  {group.map((e, i) => {
                    const isSwap = e.kind === "buy" || e.kind === "sell";
                    const subtitle = !e.success
                      ? t("activity.failed")
                      : e.kind === "send"
                      ? `${t("activity.to")} ${shortAddress(e.peer, 5)}`
                      : e.kind === "receive"
                      ? `${t("activity.from")} ${shortAddress(e.peer, 5)}`
                      : isSwap
                      ? t("activity.alkanes")
                      : e.legs.length
                      ? e.legs.map((l) => sym(l.assetId)).join(" · ")
                      : shortAddress(e.txid, 6);

                    return (
                      <div
                        className={s.row}
                        key={e.txid + i}
                        onClick={() => openTx(e)}
                      >
                        <ActivityIcon entry={e} network={network} sym={sym} />
                        <div className={s.rowMain}>
                          <span className={s.rowTitle}>
                            {t(`activity.${TITLE_KEY[e.kind]}`)}
                          </span>
                          <span
                            className={cn(s.rowSub, { [s.rowFail]: !e.success })}
                          >
                            {subtitle}
                          </span>
                        </div>
                        <div className={s.rowAmounts}>
                          {e.legs.map((leg, li) => {
                            const { sign, text } = formatSignedAlkaneAmount(
                              leg.delta
                            );
                            // A split just moves the asset between the user's
                            // own utxos: no direction, so no sign/color.
                            const isSplit = e.kind === "split";
                            return (
                              <ActivityAmount
                                key={li}
                                amount={isSplit ? text : `${sign} ${text}`}
                                symbol={sym(leg.assetId)}
                                positive={!isSplit && sign === "+"}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div ref={ref} className={s.loadMore}>
            {loadingMore && <LoadingIcons.TailSpin className={s.loadMoreSpin} />}
          </div>
        </>
      )}
    </div>
  );
};

export default Activity;
