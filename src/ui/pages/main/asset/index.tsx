import { t } from "i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import s from "./styles.module.scss";
import { useAppState } from "@/ui/states/appState";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { ss } from "@/ui/utils";
import { networkInfo } from "@/shared/networks";
import NetworkIcon from "@/ui/components/network-icon";
import SquareAction from "@/ui/components/square-action";
import {
  CaretLeftBoldIcon,
  PaperPlaneTiltBoldIcon,
  PaperPlaneTiltFillIcon,
  QrCodeBoldIcon,
  QrCodeFillIcon,
  SwapBoldIcon,
  SwapFillIcon,
} from "@/ui/icons/phosphor";

/**
 * Single-asset view: like the home page, but headed by the asset's own USD
 * price instead of the portfolio value.
 */
const Asset = () => {
  const { assetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { network } = useAppState(ss(["network"]));
  const { currentPrice } = useTransactionManagerContext();

  const isBtc = assetId === "btc";
  const hasPrice =
    isBtc && networkInfo(network).hasPrice && currentPrice !== undefined;

  const name = isBtc
    ? t("wallet_page.bitcoin")
    : location.state?.name ?? assetId ?? "";
  const symbol = isBtc ? "BTC" : location.state?.symbol ?? assetId ?? "";

  return (
    <div className={s.assetDiv}>
      <div className={s.header}>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate("/home")}
        >
          <CaretLeftBoldIcon size={18} />
        </button>
        <div className={s.headerTitle}>
          <span>{name}</span>
        </div>
      </div>

      <div className={s.assetIcon}>
        {isBtc ? (
          <NetworkIcon network={network} size={48} />
        ) : (
          <div className={s.letterIcon}>
            <span>{symbol.slice(0, 1)}</span>
          </div>
        )}
      </div>

      <div className={s.price}>
        {hasPrice ? (
          <span className={s.priceValue}>
            $
            {currentPrice!.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ) : (
          <span className={s.priceValue}>--</span>
        )}
      </div>

      <div className={s.squareActions}>
        <SquareAction
          to={"/pages/create-send"}
          icon={<PaperPlaneTiltBoldIcon size={26} />}
          iconHover={<PaperPlaneTiltFillIcon size={26} />}
          label={t("wallet_page.send")}
        />
        <SquareAction
          onClick={() => navigate("/swap")}
          icon={<SwapBoldIcon size={26} />}
          iconHover={<SwapFillIcon size={26} />}
          label={t("nav.swap")}
        />
        <SquareAction
          to={"/pages/receive"}
          icon={<QrCodeBoldIcon size={26} />}
          iconHover={<QrCodeFillIcon size={26} />}
          label={t("wallet_page.receive")}
        />
      </div>

    </div>
  );
};

export default Asset;
