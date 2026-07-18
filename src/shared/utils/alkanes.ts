/** Every alkane (and BTC, in sats) uses 8 decimals of precision. */
export const ALKANE_DECIMALS = 8;

/** Default icon CDN, matching the espo explorer (cdn.ordiscan.com/alkanes). */
const ALKANE_ICON_BASE = "https://cdn.ordiscan.com/alkanes";

/** Per-id icon overrides, mirroring the espo explorer's mainnet overrides. */
const ICON_OVERRIDES: Record<string, string> = {
  "32:0": "https://i.ibb.co/6cR2hC05/frbtc-improved-1.png",
  "2:68479": "https://cdn.idclub.io/alkanes/2-62083.webp",
  "2:77623": "https://i.ibb.co/nN1LKyZb/fire.png",
};

/**
 * Icon URL for an alkane id ("block:tx"), using the same ordiscan CDN and
 * `{block}_{tx}` path the espo explorer uses, with its known overrides.
 */
export function alkaneIconUrl(id: string): string {
  const override = ICON_OVERRIDES[id];
  if (override) return override;
  const [block, tx] = id.split(":");
  return `${ALKANE_ICON_BASE}/${block}_${tx}`;
}

/** Convert a raw 8-decimal integer balance string to a decimal number. */
export function alkaneBalanceToNumber(rawBalance: string): number {
  return Number(rawBalance) / 10 ** ALKANE_DECIMALS;
}

/**
 * Human-readable alkane/BTC amount from a raw 8-decimal integer string.
 * Trims trailing zeros, keeps up to `maxFrac` fraction digits, and groups the
 * integer part with thousands separators (e.g. `2,567,890.1`).
 */
export function formatAlkaneAmount(rawBalance: string, maxFrac = 8): string {
  const value = alkaneBalanceToNumber(rawBalance);
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
    useGrouping: true,
  });
}

/** Format a USD value with 2 decimals and thousands separators. */
export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a USD price with precision that adapts to magnitude, so sub-cent
 * tokens keep their significant digits (e.g. 0.0097 -> "0.0097") while normal
 * prices stay at 2 decimals (e.g. 51881.89 -> "51,881.89").
 */
export function formatUsdPrice(value: number): string {
  const abs = Math.abs(value);
  let maxFrac = 2;
  if (abs > 0 && abs < 1) {
    if (abs >= 0.01) maxFrac = 4;
    else if (abs >= 0.0001) maxFrac = 6;
    else maxFrac = 8;
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  });
}

/** Signed USD change like "+$0.18" / "-$15.04". */
export function formatUsdChange(value: number): string {
  return `${value >= 0 ? "+" : "-"}$${formatUsd(Math.abs(value))}`;
}

/**
 * Verified (manually whitelisted) token ids. Mirrors the subfrost app's curated
 * token whitelist (CURATED_TOKEN_IDS in its lib/alkanes/curated-pools.ts), plus
 * BTC and frBTC (32:0), which are always verified. Drives the verified badge.
 */
export const VERIFIED_TOKEN_IDS: ReadonlySet<string> = new Set([
  "btc",
  "32:0", // frBTC
  "2:0", // DIESEL
  "2:16", // METHANE
  "2:69", // FARTANE
  "2:25349", // ARBUZ
  "2:25720", // MIST (ALKAMIST)
  "2:35275", // DUST (GOLD DUST)
  "2:56801", // bUSD
  "2:68479", // TORTILLA
  "2:77313", // BB
  "2:77623", // FIRE
]);

/** Whether a token id is verified (whitelisted, or BTC/frBTC). */
export function isVerifiedToken(id: string): boolean {
  return VERIFIED_TOKEN_IDS.has(id);
}

/** Well-known alkane names/symbols (the curated whitelist + BTC family). */
export const KNOWN_ALKANES: Record<string, { name: string; symbol: string }> = {
  "2:0": { name: "DIESEL", symbol: "DIESEL" },
  "2:16": { name: "METHANE", symbol: "METHANE" },
  "2:69": { name: "FARTANE", symbol: "FARTANE" },
  "2:25349": { name: "ARBUZ", symbol: "ARBUZ" },
  "2:25720": { name: "ALKAMIST", symbol: "MIST" },
  "2:35275": { name: "GOLD DUST", symbol: "DUST" },
  "2:56801": { name: "bUSD", symbol: "bUSD" },
  "2:68479": { name: "TORTILLA", symbol: "TORTILLA" },
  "2:77313": { name: "BB", symbol: "BB" },
  "2:77623": { name: "FIRE", symbol: "FIRE" },
  "32:0": { name: "frBTC", symbol: "frBTC" },
};

/** Abbreviated USD (e.g. 17_000_000 -> "$17M", 689_000 -> "$689K"). */
export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const unit = (n: number, suffix: string) => {
    const s = n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
    return `${sign}$${s}${suffix}`;
  };
  if (abs >= 1e9) return unit(abs / 1e9, "B");
  if (abs >= 1e6) return unit(abs / 1e6, "M");
  if (abs >= 1e3) return unit(abs / 1e3, "K");
  return `${sign}$${abs.toFixed(2)}`;
}

/** Signed percentage change like "+1,386.09%" / "-7.09%". */
export function formatPercentChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(pct).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Display symbol for an asset id: "btc" -> BTC, a known alkane -> its symbol,
 * a `lookup` hit (e.g. from the portfolio) -> its symbol, else the raw id.
 */
export function alkaneSymbol(
  assetId: string,
  lookup?: Map<string, string>
): string {
  if (assetId === "btc") return "BTC";
  return (
    lookup?.get(assetId) ??
    KNOWN_ALKANES[assetId]?.symbol ??
    assetId
  );
}

/** Split a raw signed 8-decimal delta into a sign and a trimmed magnitude. */
export function formatSignedAlkaneAmount(rawDelta: string): {
  sign: "+" | "-";
  text: string;
} {
  const n = Number(rawDelta);
  return {
    sign: n >= 0 ? "+" : "-",
    text: formatAlkaneAmount(String(Math.abs(n))),
  };
}
