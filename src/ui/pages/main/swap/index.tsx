import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "i18next";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { TailSpin } from "react-loading-icons";
import cn from "classnames";
import s from "./styles.module.scss";
import type { ActivityKind, ITokenSummary } from "@/shared/interfaces/api";
import { useAppState } from "@/ui/states/appState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useControllersState } from "@/ui/states/controllerState";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { useEspoQuery } from "@/ui/utils/query";
import { ss, normalizeAmount } from "@/ui/utils";
import { toRawAmount } from "@/ui/pages/main/send/create-send/validate";
import {
  ALKANE_DECIMALS,
  formatAlkaneAmount,
  formatUsdPrice,
} from "@/shared/utils/alkanes";
import TokenSearch from "@/ui/components/token-search";
import TokenCard from "@/ui/components/token-card";
import AlkaneIcon from "@/ui/components/alkane-icon";
import NetworkIcon from "@/ui/components/network-icon";
import { networkInfo } from "@/shared/networks";
import {
  CaretDownBoldIcon,
  CaretLeftBoldIcon,
  GearSixFillIcon,
} from "@/ui/icons/phosphor";

/** A swap side's asset: BTC, or an alkane by "block:tx". */
export interface SwapAsset {
  id: string;
  name: string;
  symbol: string;
  /**
   * USD price carried from wherever the asset was picked (search/trending
   * rows carry espo's candle price), so the estimate works for tokens the
   * wallet does not hold.
   */
  priceUsd?: number | null;
}

const BTC_ASSET: SwapAsset = { id: "btc", name: "Bitcoin", symbol: "BTC" };

const toSwapAsset = (tok: ITokenSummary): SwapAsset => ({
  id: tok.id,
  name: tok.name,
  symbol: tok.symbol,
  priceUsd: tok.priceUsd,
});

/** frBTC — a BTC leg against it is a plain wrap/unwrap, not an AMM swap. */
const FRBTC_ID = "32:0";

/** Which field the user typed in last. It decides the quote's direction. */
type Side = "pay" | "receive";

const PERCENTS = [0.25, 0.5, 0.75, 1] as const;

/**
 * Subfrost's invert glyph. Their artwork only fills ~14 units of its 24-unit
 * canvas, so the viewBox is tightened to the drawn arrow (5..19 plus half the
 * stroke and its round caps) and the layout size is pinned in CSS (.flip svg),
 * which beats any attribute-level sizing interference.
 */
const InvertArrow = () => (
  <svg
    width="18"
    height="18"
    viewBox="3.75 3.75 16.5 16.5"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 5v14M19 12l-7 7-7-7"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Swap: two amount cards (the whole card is the input) with the asset selectors
 * floating top-right and an invert button bridging the gap, an expandable
 * settings widget, then the trending token list. Typing in either card quotes
 * in that direction: the pay field quotes exact-in, the receive field exact-out.
 */
const Swap = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { network } = useAppState(ss(["network"]));
  const { portfolio } = useAssetManagerContext();
  const { feeRates } = useTransactionManagerContext();
  const { apiController, keyringController } = useControllersState(
    ss(["apiController", "keyringController"])
  );

  // Arriving from a token page's Swap action prefills BTC -> that token.
  const prefill = location.state?.swapAsset as SwapAsset | undefined;

  const [from, setFrom] = useState<SwapAsset>(BTC_ASSET);
  const [to, setTo] = useState<SwapAsset | undefined>(prefill);
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [edited, setEdited] = useState<Side>("pay");
  const [picking, setPicking] = useState<"from" | "to" | undefined>();
  const [building, setBuilding] = useState(false);

  // Transaction settings.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState("5");
  const [deadline, setDeadline] = useState("5");
  const [customFee, setCustomFee] = useState("");

  // Seed the fee field with the live "fast" rate once it arrives; after that
  // the field is the user's.
  const feeSeeded = useRef(false);
  useEffect(() => {
    if (!feeSeeded.current && feeRates?.fast) {
      feeSeeded.current = true;
      setCustomFee(String(feeRates.fast));
    }
  }, [feeRates]);

  const payRef = useRef<HTMLInputElement>(null);
  const receiveRef = useRef<HTMLInputElement>(null);

  const trendingQuery = useEspoQuery(["trending"], () =>
    apiController.getTrendingTokens()
  );

  // Which tokens sit in at least one pool: gates the "your balance" rows on
  // the asset picker to assets that can actually be swapped.
  const pooledQuery = useEspoQuery(
    ["pool-token-ids"],
    () => apiController.getPoolTokenIds(),
    { enabled: !!picking }
  );

  /** The side the user typed drives the quote; the other side is derived. */
  const typed = edited === "pay" ? payAmount : receiveAmount;

  // Debounce what drives the quote so every keystroke isn't an RPC round-trip.
  const [debouncedAmount, setDebouncedAmount] = useState(typed);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedAmount(typed), 300);
    return () => clearTimeout(h);
  }, [typed]);

  const rawTyped = useMemo(() => {
    try {
      return toRawAmount(debouncedAmount);
    } catch {
      return 0n;
    }
  }, [debouncedAmount]);

  const exactOut = edited === "receive";

  const quoteQuery = useEspoQuery(
    ["swap-quote", from.id, to?.id ?? "", rawTyped.toString(), edited],
    () =>
      apiController.getSwapQuote(
        from.id,
        to!.id,
        rawTyped.toString(),
        exactOut
      ),
    { enabled: !!to && rawTyped > 0n }
  );
  const quote = quoteQuery.data;

  // Raw value of what is in the field RIGHT NOW (pre-debounce), so loading
  // states can react on the first keystroke instead of 300ms later.
  const typedRaw = useMemo(() => {
    try {
      return toRawAmount(typed);
    } catch {
      return 0n;
    }
  }, [typed]);
  const debouncePending = typed !== debouncedAmount;
  const quoting =
    !!to &&
    (debouncePending
      ? typedRaw > 0n
      : rawTyped > 0n && !quoteQuery.isFetched);

  // Mirror the quote into whichever field the user is NOT typing in. Clearing
  // the typed side clears the derived side too, so the pair never disagrees.
  useEffect(() => {
    if (rawTyped <= 0n) {
      if (edited === "pay") setReceiveAmount("");
      else setPayAmount("");
      return;
    }
    if (!quote) return;
    if (edited === "pay") setReceiveAmount(formatAlkaneAmount(quote.amountOut));
    else setPayAmount(formatAlkaneAmount(quote.amountIn));
  }, [quote, rawTyped, edited]);

  /** Raw 8-decimal balance of a side's asset, from the portfolio. */
  const balanceOf = (asset?: SwapAsset): string | undefined => {
    if (!asset) return undefined;
    if (asset.id === "btc") return portfolio?.btc?.balance;
    return portfolio?.alkanes.find((a) => a.id === asset.id)?.balance;
  };

  const priceOf = (asset?: SwapAsset) => {
    if (!asset) return null;
    if (asset.id === "btc") return portfolio?.btc?.priceUsd ?? null;
    // the portfolio's live price when held; else whatever the asset row
    // carried when it was picked (espo's candle price)
    return (
      portfolio?.alkanes.find((a) => a.id === asset.id)?.priceUsd ??
      asset.priceUsd ??
      null
    );
  };

  const fromBalance = balanceOf(from);
  const toBalance = balanceOf(to);

  const usdOf = (asset: SwapAsset | undefined, amount: string) => {
    const price = priceOf(asset);
    const amt = parseFloat(amount);
    if (price == null || !Number.isFinite(amt) || amt <= 0) return null;
    return amt * price;
  };
  const payUsd = usdOf(from, payAmount);
  const receiveUsd = usdOf(to, receiveAmount);

  const flip = () => {
    if (!to) return;
    const prevFrom = from;
    setFrom(to);
    setTo(prevFrom);
    setPayAmount("");
    setReceiveAmount("");
    setEdited("pay");
  };

  const setPercent = (pct: number) => {
    if (fromBalance == null) return;
    const part = (BigInt(fromBalance) * BigInt(Math.round(pct * 10000))) / 10000n;
    setEdited("pay");
    setPayAmount(formatAlkaneAmount(part.toString()));
  };

  /** Which percent button (if any) the current pay amount matches. */
  const activePercent = useMemo(() => {
    if (fromBalance == null || !payAmount) return undefined;
    let raw: bigint;
    try {
      raw = toRawAmount(payAmount);
    } catch {
      return undefined;
    }
    if (raw <= 0n) return undefined;
    const bal = BigInt(fromBalance);
    if (bal <= 0n) return undefined;
    return PERCENTS.find(
      (p) => (bal * BigInt(Math.round(p * 10000))) / 10000n === raw
    );
  }, [payAmount, fromBalance]);

  /** wrap / unwrap when a BTC leg faces frBTC directly; otherwise a swap. */
  const kind: ActivityKind =
    from.id === "btc" && to?.id === FRBTC_ID
      ? "wrap"
      : from.id === FRBTC_ID && to?.id === "btc"
      ? "unwrap"
      : "buy";
  const kindLabelKey =
    kind === "wrap"
      ? "transaction_info.kind.wrap"
      : kind === "unwrap"
      ? "transaction_info.kind.unwrap"
      : "transaction_info.kind.swap";

  const slippageBps = useMemo(() => {
    const pct = parseFloat(slippage);
    if (!Number.isFinite(pct) || pct < 0) return 100;
    return Math.min(5000, Math.round(pct * 100));
  }, [slippage]);

  const deadlineBlocks = useMemo(() => {
    const n = parseInt(deadline, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(1000, n) : 0;
  }, [deadline]);

  const feeRate = useMemo(() => {
    const n = parseFloat(customFee);
    if (Number.isFinite(n) && n > 0) return n;
    return feeRates?.fast ?? 5;
  }, [customFee, feeRates]);

  /**
   * Exact-in spends the quote as-is; exact-out has to authorize slippage ABOVE
   * the quote, so the amount actually at risk is the grossed-up input.
   */
  const maxAmountIn = useMemo(() => {
    if (!quote) return 0n;
    const amountIn = BigInt(quote.amountIn);
    if (!exactOut) return amountIn;
    return (amountIn * BigInt(10000 + slippageBps)) / 10000n;
  }, [quote, exactOut, slippageBps]);

  const minAmountOut = useMemo(() => {
    if (!quote) return 0n;
    const amountOut = BigInt(quote.amountOut);
    if (exactOut) return amountOut;
    return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
  }, [quote, exactOut, slippageBps]);

  const exceedsBalance =
    fromBalance != null && maxAmountIn > 0n && maxAmountIn > BigInt(fromBalance);

  const canSwap =
    !!to && rawTyped > 0n && !!quote && !quoting && !exceedsBalance && !building;

  const busy = building || (!!to && rawTyped > 0n && quoting);
  const actionLabel = building
    ? t("swap.building")
    : !to
    ? t("swap.select_asset_first")
    : rawTyped <= 0n
    ? t("swap.enter_amount")
    : quoting
    ? t("swap.building")
    : !quote
    ? t("swap.no_route")
    : exceedsBalance
    ? t("swap.insufficient_balance")
    : t("swap.swap_action");

  /** "1 BTC = 49.38 DIESEL", the settings widget's collapsed summary. */
  const rateText = useMemo(() => {
    if (!quote || !to) return undefined;
    const amountIn = Number(quote.amountIn);
    const amountOut = Number(quote.amountOut);
    if (!amountIn || !amountOut) return undefined;
    const rate = amountOut / amountIn;
    const raw = BigInt(Math.round(rate * 10 ** ALKANE_DECIMALS)).toString();
    return `1 ${from.symbol.toUpperCase()} = ${formatAlkaneAmount(
      raw
    )} ${to.symbol.toUpperCase()}`;
  }, [quote, from, to]);

  const onSwap = async () => {
    if (!to || !quote) return;
    setBuilding(true);
    try {
      const pkg = await keyringController.buildSwapPackage({
        fromId: from.id,
        toId: to.id,
        rawAmountIn: maxAmountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        feeRate,
        mode: exactOut ? "exactOut" : "exactIn",
        deadlineBlocks,
        path: quote.path,
      });

      // Per-tx optimistic activity entries: the shapes are fully known here,
      // so the feeds can show the package the instant it broadcasts (espo
      // replaces these with real classifications once it indexes). The wrap
      // mint approximates the 0.1% premium; espo corrects it on index.
      const optimistic = pkg.txs.map((tx) => {
        const label = tx.label;
        if (label === "wrap") {
          const minted = maxAmountIn - maxAmountIn / 1000n;
          return {
            kind: "wrap" as const,
            timestamp: 0,
            confirmed: false,
            success: true,
            legs: [{ assetId: FRBTC_ID, delta: minted.toString() }],
          };
        }
        if (label === "unwrap") {
          return {
            kind: "unwrap" as const,
            timestamp: 0,
            confirmed: false,
            success: true,
            legs: [{ assetId: FRBTC_ID, delta: `-${minAmountOut}` }],
          };
        }
        const legs = [];
        if (to.id !== "btc") {
          legs.push({ assetId: to.id, delta: quote.amountOut });
        }
        if (from.id !== "btc") {
          legs.push({ assetId: from.id, delta: `-${quote.amountIn}` });
        }
        if (!legs.length) legs.push({ assetId: FRBTC_ID, delta: "0" });
        return {
          kind: "buy" as const,
          timestamp: 0,
          confirmed: false,
          success: true,
          legs,
        };
      });

      navigate("/pages/confirm-swap", {
        state: {
          hexes: pkg.txs.map((tx) => tx.hex),
          labels: pkg.txs.map((tx) =>
            t(`transaction_info.kind.${tx.label}`, tx.label)
          ),
          kind,
          assetId: to.id,
          symbol: to.symbol.toUpperCase(),
          headerName: `${t(kindLabelKey)} ${payAmount} ${from.symbol.toUpperCase()}`,
          feeRate: pkg.packageFeeRate ?? feeRate,
          optimistic,
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
      console.error(e);
    } finally {
      setBuilding(false);
    }
  };

  const onPicked = (tok: ITokenSummary) => {
    const asset = toSwapAsset(tok);
    if (picking === "from") {
      // Picking the asset already on the other side swaps the two instead.
      if (to && to.id === asset.id) setTo(from);
      setFrom(asset);
    } else if (picking === "to") {
      if (from.id === asset.id) setFrom(to ?? BTC_ASSET);
      setTo(asset);
    }
    setPicking(undefined);
  };

  const assetSelector = (asset: SwapAsset | undefined, side: "from" | "to") => (
    <button
      className={s.selector}
      onClick={(e) => {
        e.stopPropagation();
        setPicking(side);
      }}
    >
      {asset ? (
        <span className={`alk-icon-wrap ${s.selectorIcon}`} aria-hidden="true">
          {asset.id === "btc" ? (
            <NetworkIcon network={network} size={20} />
          ) : (
            <AlkaneIcon id={asset.id} symbol={asset.symbol} />
          )}
        </span>
      ) : undefined}
      <span className={s.selectorSym}>
        {asset ? asset.symbol.toUpperCase() : t("swap.select")}
      </span>
      <CaretDownBoldIcon size={14} className="dropdown-caret" />
    </button>
  );

  if (picking) {
    // Pinned above trending: BTC (not an alkane, so espo's search never
    // returns it), frBTC, and every held token that has a pool to swap in.
    const btcRow: ITokenSummary = {
      id: "btc",
      name: networkInfo(network).slug === "mainnet" ? "Bitcoin" : "Regtest Bitcoin",
      symbol: "BTC",
      priceUsd: portfolio?.btc?.priceUsd ?? null,
      change24h: portfolio?.btc?.change24h ?? null,
      marketCapUsd: null,
      volumeUsd: null,
    };
    const frbtcHeld = portfolio?.alkanes.find((a) => a.id === FRBTC_ID);
    const frbtcRow: ITokenSummary = {
      id: FRBTC_ID,
      name: frbtcHeld?.name ?? "frBTC",
      symbol: frbtcHeld?.symbol ?? "frBTC",
      priceUsd: frbtcHeld?.priceUsd ?? portfolio?.btc?.priceUsd ?? null,
      change24h: frbtcHeld?.change24h ?? null,
      marketCapUsd: null,
      volumeUsd: null,
    };
    const pooled = new Set(pooledQuery.data ?? []);
    const held: ITokenSummary[] = (portfolio?.alkanes ?? [])
      .filter((a) => a.id !== FRBTC_ID && pooled.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        symbol: a.symbol,
        priceUsd: a.priceUsd,
        change24h: a.change24h,
        marketCapUsd: null,
        volumeUsd: null,
      }));
    return (
      <div className={s.picker}>
        <div className={s.pickerHead}>
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setPicking(undefined)}
          >
            <CaretLeftBoldIcon size={18} />
          </button>
          <span className={s.pickerTitle}>{t("swap.select_asset")}</span>
        </div>
        <TokenSearch onSelect={onPicked} pinned={[btcRow, frbtcRow, ...held]} />
      </div>
    );
  }

  return (
    <div className={s.swap}>
      <div className={s.inputs}>
        <div className={s.fromWrap}>
          {/* the whole card is the input: clicking anywhere focuses the amount */}
          <div
            className={cn(s.card, s.cardFrom)}
            onClick={() => payRef.current?.focus()}
          >
            <span className={s.label}>{t("swap.you_pay")}</span>
            {exactOut && quoting ? (
              <div className={s.amountSkeleton} />
            ) : (
              <input
                ref={payRef}
                className={s.amountInput}
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={payAmount}
                onChange={(e) => {
                  setEdited("pay");
                  setPayAmount(normalizeAmount(e.target.value));
                }}
              />
            )}
            <div className={s.meta}>
              <span>{payUsd != null ? `$${formatUsdPrice(payUsd)}` : ""}</span>
              {fromBalance != null ? (
                <span>
                  {t("swap.balance")} {formatAlkaneAmount(fromBalance)}
                </span>
              ) : undefined}
            </div>
            {fromBalance != null ? (
              <div className={s.percents} onClick={(e) => e.stopPropagation()}>
                {PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={cn(
                      s.percent,
                      activePercent === p ? s.percentOn : undefined
                    )}
                    onClick={() => setPercent(p)}
                  >
                    {p === 1 ? t("send.create_send.max_amount") : `${p * 100}%`}
                  </button>
                ))}
              </div>
            ) : undefined}
            {assetSelector(from, "from")}
          </div>

          <div className={s.flipWrap}>
            <button className={s.flip} onClick={flip} aria-label={t("swap.flip")}>
              <InvertArrow />
            </button>
          </div>
        </div>

        <div
          className={cn(s.card, s.cardTo)}
          onClick={() => receiveRef.current?.focus()}
        >
          <span className={s.label}>{t("swap.you_receive")}</span>
          {!exactOut && quoting ? (
            <div className={s.amountSkeleton} />
          ) : (
            <input
              ref={receiveRef}
              className={s.amountInput}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={receiveAmount}
              onChange={(e) => {
                setEdited("receive");
                setReceiveAmount(normalizeAmount(e.target.value));
              }}
            />
          )}
          <div className={s.meta}>
            <span>
              {receiveUsd != null ? `$${formatUsdPrice(receiveUsd)}` : ""}
            </span>
            {toBalance != null ? (
              <span>
                {t("swap.balance")} {formatAlkaneAmount(toBalance)}
              </span>
            ) : undefined}
          </div>
          {assetSelector(to, "to")}
        </div>
      </div>

      <div className={s.settings}>
        <button
          type="button"
          className={cn(s.settingsTrigger, {
            [s.settingsTriggerOpen]: settingsOpen,
          })}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <span className={s.rate}>
            {rateText ?? t("swap.transaction_settings")}
          </span>
          <GearSixFillIcon
            size={16}
            className={cn(s.gear, settingsOpen ? s.gearOn : undefined)}
          />
        </button>

        {settingsOpen ? (
          <div className={s.settingsBody}>
            {quote ? (
              <div className={s.row}>
                <span className={s.rowLabel}>
                  {exactOut ? t("swap.max_sent") : t("swap.min_received")}
                </span>
                <span className={s.rowValue}>
                  {formatAlkaneAmount(
                    (exactOut ? maxAmountIn : minAmountOut).toString()
                  )}{" "}
                  {(exactOut ? from : to)?.symbol.toUpperCase()}
                </span>
              </div>
            ) : undefined}

            <div className={s.row}>
              <span className={s.rowLabel}>{t("swap.slippage")}</span>
              <div className={s.inputWrap}>
                <input
                  className={cn(s.settingsInput, s.inputPct)}
                  type="text"
                  inputMode="decimal"
                  value={slippage}
                  onChange={(e) => setSlippage(normalizeAmount(e.target.value))}
                  onBlur={() => {
                    if (!slippage || parseFloat(slippage) <= 0) setSlippage("5");
                  }}
                />
                <span className={s.inputUnit}>%</span>
              </div>
            </div>

            <div className={s.row}>
              <span className={s.rowLabel}>{t("swap.deadline_blocks")}</span>
              <div className={s.inputWrap}>
                <input
                  className={s.settingsInput}
                  type="text"
                  inputMode="numeric"
                  value={deadline}
                  onChange={(e) =>
                    setDeadline(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  onBlur={() => {
                    if (!deadline) setDeadline("5");
                  }}
                />
              </div>
            </div>

            <div className={s.row}>
              <span className={s.rowLabel}>{t("swap.transaction_fee")}</span>
              <div className={s.inputWrap}>
                <input
                  className={cn(s.settingsInput, s.inputFee)}
                  type="text"
                  inputMode="decimal"
                  placeholder={String(feeRates?.fast ?? 5)}
                  value={customFee}
                  onChange={(e) => setCustomFee(normalizeAmount(e.target.value))}
                />
                <span className={s.inputUnit}>sat/Vb</span>
              </div>
            </div>
          </div>
        ) : undefined}
      </div>

      <button
        className={`btn ${s.swapBtn}`}
        disabled={!canSwap}
        onClick={onSwap}
      >
        {actionLabel}
        {busy ? (
          <TailSpin className={s.btnSpin} strokeWidth={6} />
        ) : undefined}
      </button>

      <div className={s.trending}>
        <h2 className={s.trendingTitle}>{t("search.trending")}</h2>
        {trendingQuery.data === undefined ? (
          <div className={s.loader}>
            <TailSpin className="animate-spin" />
          </div>
        ) : (
          trendingQuery.data.map((tok, i) => (
            <TokenCard
              key={tok.id}
              token={tok}
              rank={i + 1}
              onClick={() => {
                if (from.id === tok.id) setFrom(BTC_ASSET);
                setTo(toSwapAsset(tok));
              }}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Swap;
