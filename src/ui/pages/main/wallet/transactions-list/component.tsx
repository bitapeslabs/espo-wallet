import s from "../styles.module.scss";
import {
  shortAddress,
  isIncomeTx,
  getTransactionValue,
} from "@/shared/utils/transactions";
import { t } from "i18next";
import { Link } from "react-router-dom";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import cn from "classnames";
import { useInView } from "react-intersection-observer";
import { useEffect, useState } from "react";
import LoadingIcons, { TailSpin } from "react-loading-icons";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { networkInfo } from "@/shared/networks";
import { ss } from "@/ui/utils";
import DateComponent from "@/ui/components/date";
import { MoonFillIcon } from "@/ui/icons/phosphor";

export function groupBy<T, K extends keyof any>(
  array: T[],
  key: (item: T) => K
): Record<K, T[]> {
  return array.reduce((result, currentItem) => {
    const groupKey = key(currentItem);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(currentItem);
    return result;
  }, {} as Record<K, T[]>);
}

const TransactionList = () => {
  const { lastBlock, transactions, loadMoreTransactions, currentPrice } =
    useTransactionManagerContext();
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));
  const hasPrice = networkInfo(network).hasPrice;
  const { ref, inView } = useInView();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inView) {
      setLoading(true);
      loadMoreTransactions()
        .then(() => setLoading(false))
        .catch(console.error);
    }
  }, [inView, loadMoreTransactions]);

  if (!transactions || !lastBlock || !currentAccount || !currentAccount.address)
    return (
      <div className={s.loaderWrap}>
        <TailSpin className="animate-spin" />
      </div>
    );

  if (!transactions.length)
    return (
      <div className={s.noTransactions}>
        <MoonFillIcon size={28} className={s.noTransactionsIcon} />
        <p>{t("wallet_page.no_transactions")}</p>
      </div>
    );

  return (
    <div className={s.transactionsDiv}>
      {Object.entries(
        groupBy(transactions, (i) => {
          if (!i.status.block_time) {
            return "0";
          }
          const date = new Date(i.status.block_time * 1000);

          date.setHours(0, 0, 0, 0);

          return String(date.getTime());
        })
      ).map(([key, txs]) => {
        const isMempool = key === "0";

        if (!txs) return;

        return (
          <div className={s.txGroup} key={key}>
            <div className="review-heading">
              {isMempool ? (
                t("wallet_page.unconfirmed")
              ) : (
                <DateComponent date={Number(key)} />
              )}
            </div>

            <div className="panel svc-list" style={{ marginTop: 0, padding: 0 }}>
              {txs.map((tx, txidx) => {
                const isIncome = isIncomeTx(tx, currentAccount.address ?? "");
                const value = getTransactionValue(
                  tx,
                  currentAccount.address ?? ""
                );
                const confirmations = tx.status.confirmed
                  ? lastBlock - tx.status.block_height + 1
                  : 0;
                const isConfirmed = confirmations >= REQUIRED_CONFIRMATIONS;

                return (
                  <Link
                    className="svc-row"
                    key={key + ":" + txidx}
                    to={`/pages/transaction-info/${tx.txid}`}
                    state={{
                      transaction: tx,
                    }}
                  >
                    <div className="svc-id">
                      <div className="svc-name">
                        <span
                          className={cn("dot", {
                            on: isConfirmed,
                            busy: !isConfirmed,
                          })}
                        />
                        {shortAddress(tx.txid)}
                      </div>
                      <div className="svc-sub">
                        <span>
                          {tx.status.confirmed
                            ? isConfirmed
                              ? t("wallet_page.confirmed")
                              : `${confirmations} / ${REQUIRED_CONFIRMATIONS} ${t(
                                  "transaction_info.confirmations_label"
                                ).toLowerCase()}`
                            : t("wallet_page.unconfirmed")}
                        </span>
                      </div>
                    </div>
                    <div className="svc-meta">
                      <div className={isIncome ? "amount-in" : "amount-out"}>
                        {isIncome ? "+ " : "- "}
                        {value} BTC
                      </div>
                      {hasPrice && currentPrice !== undefined ? (
                        <div className={s.txFiat}>
                          {parseFloat(
                            (currentPrice * Number(value)).toFixed(2)
                          )}{" "}
                          USD
                        </div>
                      ) : undefined}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
      <div ref={ref} className={s.loadMore}>
        {loading && <LoadingIcons.TailSpin className={s.loadMoreSpin} />}
      </div>
    </div>
  );
};

export default TransactionList;

const REQUIRED_CONFIRMATIONS = 6;
