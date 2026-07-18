import { FC } from "react";
import cn from "classnames";
import type { Network } from "bitcoinjs-lib";
import type { IActivityEntry } from "@/shared/interfaces/api";
import NetworkIcon from "@/ui/components/network-icon";
import AlkaneIcon from "@/ui/components/alkane-icon";
import {
  ArrowDownFillIcon,
  PaperPlaneRightFillIcon,
  ScissorsFillIcon,
} from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

/** Kinds shown as a two-token pair (a swap or LP action). */
const PAIR_KINDS = new Set([
  "buy",
  "sell",
  "liquidity_add",
  "liquidity_remove",
  "pool_create",
]);

interface Props {
  entry: IActivityEntry;
  network: Network;
  sym: (id: string) => string;
}

/**
 * Activity row icon: overlapping token pair for swaps/LP, a status-badged asset
 * icon for sends/receives, and the diesel glyph on a panel for generic app
 * interactions.
 */
const ActivityIcon: FC<Props> = ({ entry, network, sym }) => {
  const tokenLegs = entry.legs.filter((l) => l.assetId !== "btc");

  // Wrap/unwrap is a BTC <-> frBTC conversion: show the two as a pair, back =
  // what you give, front = what you get.
  if (entry.kind === "wrap" || entry.kind === "unwrap") {
    const frId = tokenLegs[0]?.assetId ?? "32:0";
    const btc = <NetworkIcon network={network} size={28} />;
    const frbtc = <AlkaneIcon id={frId} symbol={sym(frId)} />;
    const wrap = entry.kind === "wrap";
    return (
      <div className={s.pair}>
        <span className={s.pairA}>{wrap ? btc : frbtc}</span>
        <span className={s.pairB}>{wrap ? frbtc : btc}</span>
      </div>
    );
  }

  if (PAIR_KINDS.has(entry.kind) && tokenLegs.length >= 2) {
    return (
      <div className={s.pair}>
        <span className={s.pairA}>
          <AlkaneIcon id={tokenLegs[0].assetId} symbol={sym(tokenLegs[0].assetId)} />
        </span>
        <span className={s.pairB}>
          <AlkaneIcon id={tokenLegs[1].assetId} symbol={sym(tokenLegs[1].assetId)} />
        </span>
      </div>
    );
  }

  if (entry.kind === "other") {
    return (
      <div className={s.appIcon}>
        <img src="/diesel.svg" alt="" />
      </div>
    );
  }

  const primaryId = tokenLegs[0]?.assetId ?? "btc";
  const badge =
    entry.kind === "receive" ? (
      <ArrowDownFillIcon size={11} />
    ) : entry.kind === "send" ? (
      <PaperPlaneRightFillIcon size={11} />
    ) : entry.kind === "split" ? (
      <ScissorsFillIcon size={11} />
    ) : undefined;

  return (
    <div className={s.iconBadgeWrap}>
      {primaryId === "btc" ? (
        <NetworkIcon network={network} size={28} />
      ) : (
        <span className={cn("alk-icon-wrap", s.rowIcon)}>
          <AlkaneIcon id={primaryId} symbol={sym(primaryId)} />
        </span>
      )}
      {badge ? <span className={s.badge}>{badge}</span> : undefined}
    </div>
  );
};

export default ActivityIcon;
