import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import cn from "classnames";
import { TailSpin } from "react-loading-icons";
import s from "./styles.module.scss";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useControllersState } from "@/ui/states/controllerState";
import { useEspoQuery } from "@/ui/utils/query";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { ss } from "@/ui/utils";
import { explorerTxUrl, networkSlug } from "@/shared/networks";
import { browserTabsCreate } from "@/shared/utils/browser";
import { shortAddress } from "@/shared/utils/transactions";
import type {
  IAlkaneMeta,
  ICandle,
  IPortfolioAsset,
} from "@/shared/interfaces/api";
import { formatUsdPrice, isVerifiedToken } from "@/shared/utils/alkanes";
import SquareAction from "@/ui/components/square-action";
import FitText from "@/ui/components/fit-text";
import PriceChart from "@/ui/components/price-chart";
import AssetCard from "@/ui/components/asset-card";
import {
  CaretLeftBoldIcon,
  ClockFillIcon,
  LinkIcon,
  SealCheckFillIcon,
  PaperPlaneTiltBoldIcon,
  PaperPlaneTiltFillIcon,
  QrCodeBoldIcon,
  QrCodeFillIcon,
  SwapBoldIcon,
  SwapFillIcon,
  UsersThreeFillIcon,
} from "@/ui/icons/phosphor";

/** Chart ranges → the espo candle timeframe + how many candles to pull. */
const RANGES: { key: string; tf: string; limit: number }[] = [
  { key: "1H", tf: "1m", limit: 60 },
  { key: "1D", tf: "15m", limit: 96 },
  { key: "1W", tf: "1h", limit: 168 },
  { key: "1M", tf: "4h", limit: 180 },
  { key: "1Y", tf: "1d", limit: 365 },
  { key: "ALL", tf: "1w", limit: 300 },
];
const DEFAULT_RANGE = "1D";

/** Compact holder count, e.g. 1,011. */
function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Human age from a deploy unix timestamp, e.g. "1y 2mo", "8mo", "12d". */
function formatAge(tsSeconds: number): string {
  if (!tsSeconds) return "-";
  const days = Math.max(0, (Date.now() / 1000 - tsSeconds) / 86400);
  if (days >= 365) {
    const y = Math.floor(days / 365);
    const mo = Math.floor((days % 365) / 30);
    return mo ? `${y}y ${mo}mo` : `${y}y`;
  }
  if (days >= 30) return `${Math.floor(days / 30)}mo`;
  return `${Math.max(1, Math.floor(days))}d`;
}

/**
 * Single-asset view: the token's live USD price in large text over a price
 * chart, range selector, action buttons, the held balance, and (for alkanes)
 * deploy/holder stat cards. Alkane sending is not implemented yet.
 */
const Asset = () => {
  const { assetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { network, explorerUrl } = useAppState(ss(["network", "explorerUrl"]));
  const { apiController } = useControllersState(ss(["apiController"]));
  const { portfolio, alkanes } = useAssetManagerContext();
  const currentAccount = useGetCurrentAccount();

  const isBtc = assetId === "btc";
  const id = assetId ?? "";

  // Prefer fresh portfolio data, fall back to the row passed via navigation.
  const alkane: IPortfolioAsset | undefined = isBtc
    ? undefined
    : alkanes.find((a) => a.id === assetId) ??
      (location.state?.alkane as IPortfolioAsset | undefined);

  const name = isBtc
    ? portfolio?.btc?.name ?? t("wallet_page.bitcoin")
    : alkane?.name ?? assetId ?? "";
  const livePrice = isBtc
    ? portfolio?.btc?.priceUsd ?? null
    : alkane?.priceUsd ?? null;

  // The held balance shown in the (non-interactive) balance card. BTC falls
  // back to the current account's sats when the portfolio hasn't loaded.
  const btcSats = portfolio?.btc
    ? Number(portfolio.btc.balance)
    : currentAccount?.balance ?? 0;
  const cardAsset: IPortfolioAsset | undefined = isBtc
    ? portfolio?.btc ?? {
        id: "btc",
        name: t("wallet_page.bitcoin"),
        symbol: "BTC",
        balance: String(btcSats),
        priceUsd: livePrice,
        valueUsd: null,
        change24h: null,
        valueChangeUsd24h: null,
      }
    : alkane;

  // Chart data for the selected range (height-versioned, cached per block).
  const [range, setRange] = useState(DEFAULT_RANGE);
  // Index of the point the cursor is scrubbing over the chart (null = none).
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const r = RANGES.find((x) => x.key === range) ?? RANGES[1];

  const candlesQuery = useEspoQuery<ICandle[] | undefined>(
    ["candles", id, r.tf, r.limit],
    () => apiController.getCandles(id, r.tf, r.limit),
    { enabled: !!id }
  );
  // `undefined` = still loading (spinner); `[]` = loaded but no chart data.
  const candles = candlesQuery.isFetched
    ? candlesQuery.data ?? []
    : undefined;

  const { data: meta } = useEspoQuery<IAlkaneMeta | undefined>(
    ["alkane-meta", id],
    () => apiController.getAlkaneMeta(id),
    { enabled: !!id && !isBtc }
  );

  // Scrubbing resets when the range (and thus the series) changes.
  useEffect(() => {
    setHoverIndex(null);
  }, [range]);

  // Price + range change derived from the candle series; a scrubbed point wins.
  const { priceUsd, changeUsd, changePct, up } = useMemo(() => {
    const pts = candles ?? [];
    const hasData = pts.length > 1;
    const loaded = candles !== undefined;
    const first = hasData ? pts[0].price : undefined;
    const last = hasData ? pts[pts.length - 1].price : undefined;
    const hoverP =
      hoverIndex != null && pts[hoverIndex] ? pts[hoverIndex].price : undefined;
    // No chart data (loaded but empty) shows a flat $0; else live/last price.
    const base = hasData ? livePrice ?? last : loaded ? 0 : livePrice;
    const price = hoverP ?? base ?? null;
    if (hasData && first != null && first > 0 && price != null) {
      const cu = price - first;
      return {
        priceUsd: price,
        changeUsd: cu,
        changePct: (cu / first) * 100,
        up: cu >= 0,
      };
    }
    return { priceUsd: price, changeUsd: null, changePct: null, up: true };
  }, [candles, livePrice, hoverIndex]);

  // Chart line colour follows the whole range, not the hovered point.
  const rangeUp = useMemo(() => {
    const pts = candles ?? [];
    return pts.length < 2 || pts[pts.length - 1].price >= pts[0].price;
  }, [candles]);

  const points = useMemo(() => (candles ?? []).map((c) => c.price), [candles]);
  const times = useMemo(() => (candles ?? []).map((c) => c.ts), [candles]);

  const openDeployTx = useCallback(() => {
    if (!meta) return;
    browserTabsCreate({
      url: explorerTxUrl(
        network,
        meta.creationTxid,
        explorerUrl?.[networkSlug(network)]
      ),
      active: true,
    }).catch(console.error);
  }, [meta, network, explorerUrl]);

  const onSend = () => {
    if (isBtc) {
      navigate("/pages/create-send");
      return;
    }
    toast(t("asset.send_alkane_unavailable"));
  };

  return (
    <div className={s.assetDiv}>
      <div className={s.header}>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate(-1)}
        >
          <CaretLeftBoldIcon size={18} />
        </button>
        <div className={s.headerTitle}>
          <span>{name}</span>
          {isVerifiedToken(id) ? (
            <SealCheckFillIcon size={16} className={s.verified} />
          ) : undefined}
        </div>
      </div>

      <div className={s.price}>
        <FitText
          className={s.priceValue}
          maxFont={34}
          minFont={16}
          screenMargin={20}
        >
          {priceUsd != null ? `$${formatUsdPrice(priceUsd)}` : "-"}
        </FitText>
        {changeUsd != null && changePct != null ? (
          <div className={s.changeRow}>
            <span className={cn(s.changeUsd, { [s.up]: up, [s.down]: !up })}>
              {up ? "+" : "-"}${formatUsdPrice(Math.abs(changeUsd))}
            </span>
            <span className={cn(s.changePct, { [s.up]: up, [s.down]: !up })}>
              {up ? "+" : "-"}
              {Math.abs(changePct).toFixed(2)}%
            </span>
          </div>
        ) : undefined}
      </div>

      <div className={s.chart}>
        <div className={s.ranges}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={cn(s.rangeBtn, { [s.rangeActive]: r.key === range })}
              onClick={() => setRange(r.key)}
            >
              {r.key}
            </button>
          ))}
        </div>
        {candles === undefined ? (
          <div className={s.chartLoader}>
            <TailSpin className="animate-spin" width={26} height={26} />
          </div>
        ) : (
          <PriceChart
            points={points}
            timestamps={times}
            up={rangeUp}
            height={172}
            onHover={setHoverIndex}
          />
        )}
      </div>

      <div className={s.squareActions}>
        <SquareAction
          onClick={onSend}
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

      {cardAsset ? (
        <div className={s.balance}>
          <AssetCard
            asset={cardAsset}
            network={network}
            fallbackName={t("wallet_page.bitcoin")}
          />
        </div>
      ) : undefined}

      {!isBtc ? (
        <div className={s.stats}>
          <div className={s.statCard}>
            <span className={s.statTitle}>{t("asset.alkane_id")}</span>
            <div className={s.statBody}>
              <span className={s.statValue}>{id}</span>
            </div>
          </div>
          {meta ? (
            <>
              <div className={s.statCard}>
                <span className={s.statTitle}>{t("asset.holders")}</span>
                <div className={s.statBody}>
                  <UsersThreeFillIcon size={18} />
                  <span className={s.statValue}>
                    {formatCount(meta.holderCount)}
                  </span>
                </div>
              </div>
              <div className={s.statCard}>
                <span className={s.statTitle}>{t("asset.age")}</span>
            <div className={s.statBody}>
              <ClockFillIcon size={18} />
              <span className={s.statValue}>
                {formatAge(meta.creationTimestamp)}
              </span>
            </div>
          </div>
          <div className={s.statCard}>
            <span className={s.statTitle}>{t("asset.deploy_tx")}</span>
            <div className={cn(s.statBody, s.deployBody)}>
              <LinkIcon size={16} />
              <span
                className={cn(s.statValue, s.deployLink)}
                role="link"
                tabIndex={0}
                onClick={openDeployTx}
                onKeyDown={(e) =>
                  e.key === "Enter" ? openDeployTx() : undefined
                }
              >
                {shortAddress(meta.creationTxid, 4)}
                </span>
              </div>
              </div>
            </>
          ) : undefined}
        </div>
      ) : undefined}
    </div>
  );
};

export default Asset;
