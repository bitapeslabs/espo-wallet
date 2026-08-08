import { useCallback, useEffect, useMemo } from "react";
import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import LoadingIcons, { TailSpin } from "react-loading-icons";
import type { IUnwrapRequest } from "@/shared/interfaces/api";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useUnwraps } from "@/ui/utils/feeds";
import { ss } from "@/ui/utils";
import { alkaneSymbol } from "@/shared/utils/alkanes";
import DateComponent from "@/ui/components/date";
import { SnowflakeBoldIcon } from "@/ui/icons/phosphor";
import UnwrapCard from "./unwrap-card";
import s from "./styles.module.scss";

/** Group requests by local day; mempool (timestamp 0) entries share "0". */
function groupByDay(rows: IUnwrapRequest[]): [string, IUnwrapRequest[]][] {
  const map = new Map<string, IUnwrapRequest[]>();
  for (const r of rows) {
    let key = "0";
    if (r.state !== "unconfirmed" && r.timestamp) {
      const d = new Date(r.timestamp * 1000);
      d.setHours(0, 0, 0, 0);
      key = String(d.getTime());
    }
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()];
}

/**
 * The snowflake tab: every subfrost unwrap request for the address, in the
 * activity feed's visual language, with the request's lifecycle state
 * (unconfirmed -> confirmed -> fulfilled) on the right. Espo only indexes
 * confirmed requests, so mempool unwraps are pulled from the activity feed.
 */
const Unwraps = () => {
  const { network } = useAppState(ss(["network"]));
  const { portfolio } = useAssetManagerContext();
  const navigate = useNavigate();

  const { ref, inView } = useInView();

  // The shared unwraps view (same caches the History tab and the unread
  // watcher use): espo's subfrost index back-filled by the activity feed.
  const { query: requestsQuery, rows } = useUnwraps();

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

  const loadMore = useCallback(() => {
    if (requestsQuery.hasNextPage && !requestsQuery.isFetchingNextPage) {
      requestsQuery.fetchNextPage().catch(console.error);
    }
  }, [requestsQuery]);

  useEffect(() => {
    if (inView) loadMore();
  }, [inView, loadMore]);

  return (
    <div className={s.unwraps}>
      <h1 className={s.title}>{t("unwraps.title")}</h1>

      {rows === undefined ? (
        <div className={s.loaderWrap}>
          <TailSpin className="animate-spin" />
        </div>
      ) : !rows.length ? (
        <div className={s.empty}>
          <SnowflakeBoldIcon size={28} className={s.emptyIcon} />
          <p>{t("unwraps.no_unwraps")}</p>
        </div>
      ) : (
        <>
          <div className={s.list}>
            {groupByDay(rows).map(([key, group]) => (
              <div key={key} className={s.group}>
                <div className="review-heading">
                  {key === "0" ? (
                    t("wallet_page.unconfirmed")
                  ) : (
                    <DateComponent date={Number(key)} />
                  )}
                </div>
                <div className={s.rows}>
                  {group.map((r) => (
                    <UnwrapCard
                      key={r.txid}
                      request={r}
                      network={network}
                      sym={sym}
                      onClick={() =>
                        navigate(`/pages/unwrap-info/${r.txid}`, {
                          state: { unwrap: r },
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div ref={ref} className={s.loadMore}>
            {requestsQuery.isFetchingNextPage && (
              <LoadingIcons.TailSpin className={s.loadMoreSpin} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Unwraps;
