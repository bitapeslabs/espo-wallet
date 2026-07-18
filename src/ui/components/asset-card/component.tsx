import { FC } from "react";
import cn from "classnames";
import type { Network } from "bitcoinjs-lib";
import type { IPortfolioAsset } from "@/shared/interfaces/api";
import NetworkIcon from "@/ui/components/network-icon";
import AlkaneIcon from "@/ui/components/alkane-icon";
import FitText from "@/ui/components/fit-text";
import {
  formatAlkaneAmount,
  formatUsd,
  formatUsdChange,
  isVerifiedToken,
} from "@/shared/utils/alkanes";
import { CaretRightBoldIcon, SealCheckFillIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

/** Balance-card numbers shrink to never exceed this width (px). */
const AMOUNT_MAX_WIDTH = 100;

interface Props {
  asset: IPortfolioAsset;
  network: Network;
  /** When set, the card is interactive (hover highlight + chevron + click). */
  onClick?: () => void;
  /** Name to show when the asset has none (e.g. "Bitcoin"). */
  fallbackName?: string;
}

/**
 * The espo-style balance card (icon, name, amount, USD value + 24h change) used
 * on the home token list and the single-asset page. Interactive only when an
 * `onClick` is given; otherwise it's a static card with no hover/caret.
 */
const AssetCard: FC<Props> = ({ asset, network, onClick, fallbackName }) => {
  const isBtc = asset.id === "btc";
  const change = asset.valueChangeUsd24h;

  return (
    <div
      className={cn("alk-card", s.card, { [s.clickable]: !!onClick })}
      onClick={onClick}
    >
      <div className="alk-line">
        {isBtc ? (
          <div className="alk-icon-wrap" aria-hidden="true">
            <NetworkIcon network={network} size={28} />
          </div>
        ) : (
          <span className="alk-token-icon" aria-hidden="true">
            <div className="alk-icon-wrap">
              <AlkaneIcon id={asset.id} symbol={asset.symbol} />
            </div>
            <span className="alk-diesel-badge">
              <span className="alk-diesel-mark" />
            </span>
          </span>
        )}
        <div className={s.assetMain}>
          <span className={s.assetNameRow}>
            <span className={s.assetName}>{asset.name || fallbackName}</span>
            {isVerifiedToken(asset.id) ? (
              <SealCheckFillIcon size={14} className={s.verified} />
            ) : undefined}
          </span>
          <span className={s.assetAmount}>
            <FitText
              className="alk-amt"
              maxFont={14}
              minFont={8}
              maxWidth={AMOUNT_MAX_WIDTH}
            >
              {formatAlkaneAmount(asset.balance ?? "0")}
            </FitText>
            <span className="alk-sym">{asset.symbol.toUpperCase()}</span>
          </span>
        </div>
        {asset.valueUsd != null ? (
          <div className={s.assetRight}>
            <span className={s.assetUsd}>${formatUsd(asset.valueUsd)}</span>
            {change != null ? (
              <span
                className={cn(s.assetChange, {
                  [s.up]: change >= 0,
                  [s.down]: change < 0,
                })}
              >
                {formatUsdChange(change)}
              </span>
            ) : undefined}
          </div>
        ) : undefined}
        {onClick ? (
          <span className={s.cardCaret} aria-hidden="true">
            <CaretRightBoldIcon size={14} />
          </span>
        ) : undefined}
      </div>
    </div>
  );
};

export default AssetCard;
