import { FC } from "react";
import cn from "classnames";
import type { ITokenSummary } from "@/shared/interfaces/api";
import AlkaneIcon from "@/ui/components/alkane-icon";
import Medal from "@/ui/components/medal";
import {
  formatCompactUsd,
  formatPercentChange,
  formatUsdPrice,
  isVerifiedToken,
} from "@/shared/utils/alkanes";
import { CaretRightBoldIcon, SealCheckFillIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

interface Props {
  token: ITokenSummary;
  /** Podium rank (1-3 render a medal); omit or >3 for none. */
  rank?: number;
  onClick?: () => void;
}

/**
 * A market/search token row: the balance-card layout, but with the token's
 * market cap under its name and USD price + 24h change on the right. Top-3
 * trending tokens get a metallic medal badge on the icon.
 */
const TokenCard: FC<Props> = ({ token, rank, onClick }) => {
  const change = token.change24h;
  return (
    <div className={cn("alk-card", s.card, { [s.clickable]: !!onClick })} onClick={onClick}>
      <div className="alk-line">
        <span className="alk-token-icon" aria-hidden="true">
          <div className="alk-icon-wrap">
            <AlkaneIcon id={token.id} symbol={token.symbol} />
          </div>
          {rank && rank <= 3 ? (
            <span className={s.medal}>
              <Medal rank={rank} size={18} />
            </span>
          ) : undefined}
        </span>

        <div className={s.main}>
          <span className={s.nameRow}>
            <span className={s.name}>{token.name}</span>
            {isVerifiedToken(token.id) ? (
              <SealCheckFillIcon size={14} className={s.verified} />
            ) : undefined}
          </span>
          <span className={s.mcap}>
            {token.marketCapUsd != null
              ? `${formatCompactUsd(token.marketCapUsd)} MC`
              : "—"}
          </span>
        </div>

        <div className={s.right}>
          <span className={s.price}>
            {token.priceUsd != null ? `$${formatUsdPrice(token.priceUsd)}` : "—"}
          </span>
          {change != null ? (
            <span
              className={cn(s.change, {
                [s.up]: change >= 0,
                [s.down]: change < 0,
              })}
            >
              {formatPercentChange(change)}
            </span>
          ) : undefined}
        </div>

        {onClick ? (
          <span className={s.cardCaret} aria-hidden="true">
            <CaretRightBoldIcon size={14} />
          </span>
        ) : undefined}
      </div>
    </div>
  );
};

export default TokenCard;
