import { FC } from "react";
import { t } from "i18next";
import cn from "classnames";
import type { Network } from "bitcoinjs-lib";
import type { IActivityEntry, IUnwrapRequest } from "@/shared/interfaces/api";
import { formatAlkaneAmount } from "@/shared/utils/alkanes";
import ActivityIcon from "@/ui/pages/main/activity/activity-icon";
import s from "./styles.module.scss";

/** The activity-icon pair (frBTC -> BTC) for an unwrap request. */
export const unwrapEntry = (r: IUnwrapRequest): IActivityEntry => ({
  txid: r.txid,
  kind: "unwrap",
  timestamp: r.timestamp,
  confirmed: r.state !== "unconfirmed",
  success: true,
  legs: [
    { assetId: "32:0", delta: `-${r.amount}` },
    { assetId: "btc", delta: r.amount },
  ],
});

interface Props {
  request: IUnwrapRequest;
  network: Network;
  sym: (id: string) => string;
  onClick: () => void;
}

/**
 * An activity-style row for one unwrap request: the frBTC -> BTC pair icon,
 * "Unwrapped" + the BTC amount, and the request's lifecycle state on the
 * right (spinner while the unwrap tx is still in the mempool).
 */
const UnwrapCard: FC<Props> = ({ request, network, sym, onClick }) => (
  <div className={s.row} onClick={onClick}>
    <ActivityIcon entry={unwrapEntry(request)} network={network} sym={sym} />
    <div className={s.rowMain}>
      <span className={s.rowTitle}>{t("activity.unwrapped")}</span>
      <span className={s.rowSub}>
        {formatAlkaneAmount(request.amount)} BTC
      </span>
    </div>
    <span
      className={cn(s.state, {
        [s.stateConfirmed]: request.state === "confirmed",
        [s.stateFulfilled]: request.state === "fulfilled",
      })}
    >
      {t(`unwraps.state_${request.state}`)}
    </span>
  </div>
);

export default UnwrapCard;
