import type {
  ActivityKind,
  ApiUTXO,
  IAccountStats,
  IActivityEntry,
  IActivityLeg,
  IAlkaneMeta,
  ICandle,
  IPortfolio,
  IPortfolioAsset,
  ITokenSummary,
  ITransaction,
  Vin,
  Vout,
  IUnwrapRequest,
} from "@/shared/interfaces/api";
import { espoRpc, espoRpcBatch, EspoRpcError } from "@/shared/utils";
import { KNOWN_ALKANES, VERIFIED_TOKEN_IDS } from "@/shared/utils/alkanes";
import { storageService } from "../services";
import { DEFAULT_FEES } from "@/shared/constant";
import { networkInfo, networkSlug } from "@/shared/networks";
import { espoProvider } from "../services/espoProvider";
import { decodeCellpackHex } from "@/shared/utils/cellpack";
import {
  DEFAULT_POOL_FEE_PER_1000,
  FRBTC_ALKANE_ID,
  FRBTC_PREMIUM_DENOMINATOR,
  alkaneIdKey,
  applyFrbtcPremium,
  DEFAULT_FRBTC_PREMIUM,
  getFrbtcPremium,
  quoteExactIn,
  quoteExactOut,
  isBoxedError,
} from "alkanesjs";

/** A quote for one side of the swap form. */
export interface ISwapQuote {
  /** Raw 8-decimal amount the user pays. */
  amountIn: string;
  /** Raw 8-decimal amount the user receives. */
  amountOut: string;
  /** The AMM pool used for the swap leg, if any ("block:tx"). */
  poolId?: string;
  /**
   * FULL token path of the AMM leg (sell first, buy last, BTC mapped onto
   * frBTC), e.g. ["32:0", "2:0"] or a multi-hop route from espo.
   */
  path?: string[];
  /** Whether the route hops through frBTC (BTC<->token). */
  viaFrbtc: boolean;
}

/** One pool as indexed by espo's ammdata module (reserves are live). */
interface EspoPool {
  base: string;
  base_reserve: string;
  quote: string;
  quote_reserve: string;
  source?: string;
}

interface EspoPoolsResult {
  ok: boolean;
  pools?: Record<string, EspoPool>;
  has_more?: boolean;
  page?: number;
  total?: number;
}

export interface UtxoQueryParams {
  hex?: boolean;
  amount?: number;
}

export interface IApiController {
  getUtxos(
    address: string,
    params?: UtxoQueryParams
  ): Promise<ApiUTXO[] | undefined>;
  pushTx(rawTx: string): Promise<{ txid?: string; error?: string }>;
  getTransactions(address: string): Promise<ITransaction[] | undefined>;
  getPaginatedTransactions(
    address: string,
    page: number
  ): Promise<ITransaction[] | undefined>;
  getBTCPrice(): Promise<number | undefined>;
  getLastBlock(): Promise<number | undefined>;
  getFees(): Promise<{ fast: number; slow: number } | undefined>;
  getAccountStats(address: string): Promise<IAccountStats | undefined>;
  getTransactionHex(txid: string): Promise<string | undefined>;
  getTransaction(txid: string): Promise<ITransaction | undefined>;
  getEnrichedTx(txid: string): Promise<EspoEnrichedTx | undefined>;
  getTxTraceStatus(
    txid: string
  ): Promise<"success" | "reverted" | "pending" | "none">;
  getUtxoValues(outpoints: string[]): Promise<number[] | undefined>;
  getOutpointAlkanes(
    outpoints: string[]
  ): Promise<Record<string, { alkane: string; amount: string }[]>>;
  getOutpointValues(outpoints: string[]): Promise<Record<string, number>>;
  getSwapQuote(
    fromId: string,
    toId: string,
    rawAmount: string,
    exactOut?: boolean
  ): Promise<ISwapQuote | undefined>;
  getPortfolioStats(address: string): Promise<IPortfolio | undefined>;
  getActivity(
    address: string,
    page: number
  ): Promise<IActivityEntry[] | undefined>;
  getCandles(
    assetId: string,
    timeframe: string,
    limit: number
  ): Promise<ICandle[] | undefined>;
  getAlkaneMeta(assetId: string): Promise<IAlkaneMeta | undefined>;
  getAlkaneInfo(id: string): Promise<
    | { name?: string; methods: { opcode: number; name: string }[]; factory?: string }
    | undefined
  >;
  getTrendingTokens(): Promise<ITokenSummary[] | undefined>;
  searchTokens(prefix: string): Promise<ITokenSummary[] | undefined>;
  getUnwrapRequests(
    address: string,
    page: number
  ): Promise<IUnwrapRequest[] | undefined>;
  getPoolTokenIds(): Promise<string[] | undefined>;
  getProjectionData(): Promise<
    | {
        signerScriptHex?: string;
        pools: Record<
          string,
          { base: string; quote: string; baseReserve: string; quoteReserve: string }
        >;
      }
    | undefined
  >;
}

/** Espo's Upgradeable-proxy fingerprint: initialize@32767 + forward@36863. */
function isUpgradeableProxy(
  methods: { opcode: number; name: string }[]
): boolean {
  const has = (name: string, opcode: number) =>
    methods.some(
      (m) => m.opcode === opcode && m.name.toLowerCase() === name
    );
  return has("initialize", 32767) && has("forward", 36863);
}

/** Number of transactions fetched per history page. */
const TX_PAGE_LIMIT = 50;

/** Number of unwrap requests fetched per page. */
const UNWRAP_PAGE_LIMIT = 20;
/** espo scales its BTC/USD price by 10^16 (PRICE_SCALE_DECIMALS). */
const PRICE_SCALE = 1e16;

/** Convert a 10^16 fixed-point USD string (ammdata) to a plain number. */
function scaleUsd(v: string | number | undefined): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v / PRICE_SCALE;
  // Large integer strings lose precision through Number(); go via BigInt.
  if (v.length > 15) {
    try {
      return Number(BigInt(v)) / PRICE_SCALE;
    } catch {
      const n = Number(v);
      return Number.isFinite(n) ? n / PRICE_SCALE : NaN;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n / PRICE_SCALE : NaN;
}

/** Trending = curated/whitelisted alkane tokens (excludes the BTC family). */
const TRENDING_TOKEN_IDS: string[] = [...VERIFIED_TOKEN_IDS].filter(
  (id) => id !== "btc" && id !== "32:0"
);

/** A token id prices directly in USD (DIESEL/FIRE) vs via the DIESEL-derived leg. */
function isDirectUsdToken(id: string): boolean {
  return id === "2:0" || id === "2:77623";
}
function tokenPricePool(id: string): string {
  return isDirectUsdToken(id) ? `${id}-usd` : `${id}-derived_2:0-usd`;
}
function tokenMcapPool(id: string): string {
  return isDirectUsdToken(id) ? `${id}-mcusd` : `${id}-derived_2:0-mcusd`;
}

type EspoCandleRes = {
  ok?: boolean;
  candles?: { ts: number; close: string; volume?: string }[];
};

/** Sorted (oldest-first) USD closes from a candle response. */
function usdClosesFromCandles(res: EspoCandleRes | undefined): number[] {
  return (res?.candles ?? [])
    .map((c) => ({ ts: Number(c.ts) || 0, val: scaleUsd(c.close) }))
    .filter((c) => c.ts > 0 && Number.isFinite(c.val))
    .sort((a, b) => a.ts - b.ts)
    .map((c) => c.val);
}

/** Total USD volume across a candle response's buckets (each scaled 10^16). */
function candleVolumeSum(res: EspoCandleRes | undefined): number {
  let sum = 0;
  for (const c of res?.candles ?? []) {
    const v = scaleUsd(c.volume);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

/** Latest USD price + first→last % change from a candle response. */
function priceChangeFromCandles(res: EspoCandleRes | undefined): {
  price: number | null;
  change: number | null;
} {
  const vals = usdClosesFromCandles(res);
  if (!vals.length) return { price: null, change: null };
  const first = vals[0];
  const last = vals[vals.length - 1];
  return { price: last, change: first > 0 ? ((last - first) / first) * 100 : null };
}

/** A single alkane/rune balance entry attached to an outpoint. */
interface EspoTokenEntry {
  alkane?: string;
  id?: string;
  amount: string;
}

/** One outpoint from essentials.get_address_spendable_outpoints. */
interface EspoSpendableOutpoint {
  outpoint: string; // "txid:vout"
  value: number; // sats
  script_pubkey_hex: string;
  block_height: number | null;
  confirmations: number;
  coinbase: boolean;
  alkanes: EspoTokenEntry[];
  runes: EspoTokenEntry[];
  raw_tx_hex: string; // full hex, or "0" when omit_raw_tx
}

interface EspoSpendableOutpointsResult {
  ok: boolean;
  error?: string;
  address?: string;
  height?: number;
  length?: number;
  outpoints?: EspoSpendableOutpoint[];
}

/** One input of an enriched espo transaction. */
export interface EspoTxInput {
  txid: string;
  vout: number;
  amount?: number;
  address?: string;
  isCoinbase?: boolean;
}

/** One output of an enriched espo transaction. */
export interface EspoTxOutput {
  amount: number;
  scriptPubKey: string;
  address?: string;
  scriptPubKeyType?: string;
}

/** A protorune edict: transfer `amount` of alkane `id` to output vout `output`. */
export interface EspoEdict {
  id: { block: number; tx: number };
  amount: number;
  output: number;
}

export interface EspoProtostone {
  edicts?: EspoEdict[];
  pointer?: number | null;
  /** Hex-encoded cellpack bytes (empty string when a plain transfer). */
  message?: string;
}

/** An enriched transaction as returned by essentials.get_address_transactions. */
export interface EspoEnrichedTx {
  txid: string;
  blockHeight: number | null;
  confirmations: number | null;
  blockTime: number | null;
  confirmed: boolean;
  fee: number | null;
  weight: number;
  size: number;
  inputs: EspoTxInput[];
  outputs: EspoTxOutput[];
  runestone?: { protostones?: EspoProtostone[] } | null;
}

interface EspoAddressTransactionsResult {
  ok: boolean;
  error?: string;
  address?: string;
  page?: number;
  limit?: number;
  total?: number | null;
  has_more?: boolean;
  transactions?: EspoEnrichedTx[];
}

interface EspoFeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

interface EspoBtcUsdPriceResult {
  ok: boolean;
  error?: string;
  price?: string;
}

/** One asset row from ammdata.get_portfolio_stats. */
interface EspoPortfolioAsset {
  name: string;
  symbol: string;
  balance: string;
  price_now_usd: string | null;
  value_now_usd: string | null;
  change_24h: string | null;
  value_change_24h_usd: string | null;
}

interface EspoPortfolioStatsResult {
  ok: boolean;
  error?: string;
  address?: string;
  complete?: boolean;
  total_value_usd?: string;
  change_24h?: string | null;
  change_24h_usd?: string | null;
  assets?: Record<string, EspoPortfolioAsset>;
}

/** One row from tokendata.get_address_activity. */
interface EspoActivityEntry {
  txid: string;
  chain_txids?: string[];
  timestamp?: number;
  height?: number;
  kind: string; // buy | sell | liquidity_add | liquidity_remove | pool_create | mint
  source?: string;
  token?: string | null; // alkane id "block:tx"
  counter_token?: string | null;
  token_delta?: string; // signed raw i128, 8 decimals
  counter_delta?: string;
  success?: boolean;
}

interface EspoAddressActivityResult {
  ok: boolean;
  error?: string;
  total?: number;
  entries?: EspoActivityEntry[];
}

const ACTIVITY_KINDS: ReadonlySet<string> = new Set([
  "buy",
  "sell",
  "liquidity_add",
  "liquidity_remove",
  "pool_create",
  "mint",
]);

/** A single espo trace event ({event:"invoke"|"create"|"return"|...}). */
/** An alkane amount inside a trace ({id, value} with hex fields). */
interface EspoTraceAlkane {
  id?: { block?: string; tx?: string };
  value?: string;
}

interface EspoTraceEvent {
  event?: string;
  data?: {
    context?: {
      /** The alkane contract this frame invoked. */
      myself?: { block?: string; tx?: string };
      /** Call inputs; inputs[0] is the opcode (hex string). */
      inputs?: string[];
      /** Alkanes flowing INTO this frame. */
      incomingAlkanes?: EspoTraceAlkane[];
    };
    /** On a `return` event, the alkanes the frame hands back. */
    response?: { alkanes?: EspoTraceAlkane[] };
    /**
     * On a `return` event, the frame's exit status. espo serializes
     * EspoSandshrewLikeTraceStatus with `rename_all = "lowercase"`, so this is
     * "success" | "failure".
     */
    status?: string;
  };
}

/** essentials.get_alkane_tx_summary — net alkane outflow(s) + traces for a tx. */
interface EspoTxSummary {
  ok: boolean;
  outflows?: { outflow?: Record<string, string> }[];
  traces?: {
    events?: EspoTraceEvent[];
    trace?: { events?: EspoTraceEvent[] };
  }[];
}

/** The frBTC synth contract (block 32, tx 0) and its wrap/unwrap opcodes. */
const FRBTC_CONTRACT = { block: 32, tx: 0 };
const FRBTC_ID = `${FRBTC_CONTRACT.block}:${FRBTC_CONTRACT.tx}`; // "32:0"
const FRBTC_WRAP_OP = 0x4d;
const FRBTC_UNWRAP_OP = 0x4e;

// The espo/oyl AMM factory router lives in the reserved block 4 and handles all
// AMM ops. Only opcodes 13 (swap exact-in) and 14 (swap exact-out) are swaps;
// 11 (add liquidity), 12 (remove liquidity), 1 (create pool) and everything
// else are not. A tx is a swap ONLY if the trace calls a factory swap opcode —
// the net alkane deltas alone can't tell a swap from an LP/mint contract call.
const AMM_FACTORY_BLOCK = 4;
const AMM_SWAP_OPS = new Set([13, 14]);

/**
 * Net alkane movement of a tx, whether it minted/deployed a new alkane, whether
 * it called the frBTC wrap/unwrap opcodes, and whether it called an AMM factory
 * swap opcode.
 */
interface AlkaneTxSummary {
  net: Record<string, number>;
  hasCreate: boolean;
  frbtc?: "wrap" | "unwrap";
  isSwap: boolean;
}

/**
 * Kind + legs inferred from a tx's net alkane outflow + traces. The outflow is
 * the pool/tx-level movement, so it's negated to the trader's perspective
 * (received = positive).
 *
 * Swap classification is TRACE-driven, not sign-driven: a tx is a swap only if
 * it invoked an AMM factory swap opcode (see AMM_SWAP_OPS). Mixed-sign deltas
 * without that opcode are some other contract call (LP, mint, router op) and
 * stay "other". A clean single-direction net movement the wallet funded is a
 * receive/send.
 */
function activityFromOutflow(
  summary: AlkaneTxSummary
): { kind: ActivityKind; legs: IActivityLeg[] } | undefined {
  const legs: IActivityLeg[] = Object.entries(summary.net)
    .filter(([, amt]) => amt !== 0)
    .map(([id, amt]) => ({ assetId: id, delta: String(-amt) }));
  // frBTC wrap (BTC -> frBTC, net +frBTC) / unwrap (frBTC -> BTC, net -frBTC),
  // identified from the trace regardless of the net leg count (an unwrap often
  // has an empty net outflow — the leg is recovered from the trace upstream).
  if (summary.frbtc) return { kind: summary.frbtc, legs };
  if (!legs.length) return undefined;
  // A trace-confirmed AMM swap.
  if (summary.isSwap) return { kind: "buy", legs };
  const hasIn = legs.some((l) => !l.delta.startsWith("-"));
  const hasOut = legs.some((l) => l.delta.startsWith("-"));
  // Mixed signs with no swap opcode = a multi-asset contract call (LP/mint/
  // router), not a swap: leave it "other".
  if (hasIn && hasOut) return undefined;
  return { kind: hasIn ? "receive" : "send", legs };
}

/**
 * Classify a wrap/unwrap from the protostone's cellpack ALONE, without traces.
 * A tx still in the mempool has no espo summary, so a wrap ([77] on 32:0) or
 * unwrap ([78, vout, amount]) would otherwise sit as "App Interaction" until
 * its first confirmation. The wrap amount is what the tx pays to scripts the
 * address does not own (the signer output), minus the standard premium; the
 * unwrap amount is right in the cellpack.
 */
function frbtcCellpackActivity(
  tx: EspoEnrichedTx,
  address: string
): { kind: ActivityKind; legs: IActivityLeg[] } | undefined {
  for (const ps of tx.runestone?.protostones ?? []) {
    if (!ps.message) continue;
    const cell = decodeCellpackHex(ps.message);
    if (!cell || cell.target.block !== 32n || cell.target.tx !== 0n) continue;

    if (cell.opcode === 77n) {
      const paid = (tx.outputs ?? [])
        .filter((o) => o.address && o.address !== address)
        .reduce((acc, o) => acc + (o.amount ?? 0), 0);
      if (paid <= 0) return undefined;
      const minted = applyFrbtcPremium(BigInt(paid), DEFAULT_FRBTC_PREMIUM);
      return {
        kind: "wrap",
        legs: [{ assetId: "32:0", delta: minted.toString() }],
      };
    }

    if (cell.opcode === 78n && cell.inputs.length >= 2) {
      return {
        kind: "unwrap",
        legs: [{ assetId: "32:0", delta: `-${cell.inputs[1]}` }],
      };
    }
  }
  return undefined;
}

/** True when an outpoint carries no alkanes or runes and is safe to spend as BTC. */
function isPureBtc(o: EspoSpendableOutpoint): boolean {
  return (
    (!o.alkanes || o.alkanes.length === 0) &&
    (!o.runes || o.runes.length === 0)
  );
}

/**
 * Map an espo enriched transaction onto the wallet's esplora-shaped
 * ITransaction so downstream UI keeps working unchanged. espo now serves a
 * real blockTime (unix seconds) on each tx, which drives the history day
 * grouping; confirmations are still recomputed from blockHeight and the tip.
 */
function mapEspoTx(e: EspoEnrichedTx): ITransaction {
  const vin: Vin[] = (e.inputs ?? []).map((i) => ({
    txid: i.txid,
    vout: i.vout,
    is_coinbase: !!i.isCoinbase,
    scriptsig: "",
    scriptsig_asm: "",
    sequence: 0,
    prevout:
      i.address !== undefined || i.amount !== undefined
        ? {
            scriptpubkey: "",
            scriptpubkey_asm: "",
            scriptpubkey_type: "",
            scriptpubkey_address: i.address ?? "",
            value: i.amount ?? 0,
          }
        : undefined,
  }));

  const vout: Vout[] = (e.outputs ?? []).map((o) => ({
    scriptpubkey: o.scriptPubKey ?? "",
    scriptpubkey_asm: "",
    scriptpubkey_type: o.scriptPubKeyType ?? "",
    scriptpubkey_address: o.address ?? "",
    value: o.amount ?? 0,
  }));

  return {
    txid: e.txid,
    version: 0,
    locktime: 0,
    size: e.size ?? 0,
    weight: e.weight ?? 0,
    sigops: 0,
    fee: e.fee ?? 0,
    vin,
    vout,
    status: {
      confirmed: !!e.confirmed,
      block_height: e.blockHeight ?? 0,
      block_hash: "",
      block_time: e.blockTime ?? 0,
    },
  };
}

/** Map a tokendata activity row to the wallet's unified entry. */
function mapAlkaneActivity(e: EspoActivityEntry): IActivityEntry {
  const legs: IActivityLeg[] = [];
  if (e.token && e.token_delta && e.token_delta !== "0") {
    legs.push({ assetId: e.token, delta: e.token_delta });
  }
  if (e.counter_token && e.counter_delta && e.counter_delta !== "0") {
    legs.push({ assetId: e.counter_token, delta: e.counter_delta });
  }
  let kind = (ACTIVITY_KINDS.has(e.kind) ? e.kind : "other") as ActivityKind;
  // frBTC is only ever minted by wrapping BTC, so tokendata's "mint" of frBTC
  // is really a wrap. (Unwrap has no tokendata kind; it comes via the raw path.)
  if (kind === "mint" && legs.length > 0 && legs.every((l) => l.assetId === FRBTC_ID)) {
    kind = "wrap";
  }
  return {
    txid: e.txid,
    kind,
    timestamp: e.timestamp ?? 0,
    confirmed: true, // indexed activity is always confirmed
    success: e.success ?? true,
    legs,
  };
}

/**
 * Classify a raw tx not covered by the semantic feed. First tries alkane
 * transfers via the protostone edicts (protorune/runes transfer rules): an
 * edict moving an alkane to an output owned by the address = received; the
 * address spending an input while edicts pay out to others = sent. Falls back
 * to plain BTC send/receive, or a generic interaction when nothing net moves.
 */
function mapRawTxActivity(tx: EspoEnrichedTx, address: string): IActivityEntry {
  const base = {
    txid: tx.txid,
    timestamp: tx.blockTime ?? 0,
    confirmed: !!tx.confirmed,
    success: true,
  };

  const protostones = tx.runestone?.protostones ?? [];
  const edicts = protostones.flatMap((p) => p.edicts ?? []);
  if (edicts.length) {
    const userIsInput = tx.inputs.some((i) => i.address === address);
    const byAlkane = new Map<string, number>();
    for (const e of edicts) {
      const id = `${e.id.block}:${e.id.tx}`;
      const outAddr = tx.outputs[e.output]?.address;
      if (!userIsInput && outAddr === address) {
        byAlkane.set(id, (byAlkane.get(id) ?? 0) + e.amount); // received
      } else if (userIsInput && outAddr && outAddr !== address) {
        byAlkane.set(id, (byAlkane.get(id) ?? 0) - e.amount); // sent
      }
    }
    const legs: IActivityLeg[] = [...byAlkane]
      .filter(([, amt]) => amt !== 0)
      .map(([id, amt]) => ({ assetId: id, delta: String(amt) }));
    if (legs.length) {
      const isReceive = !userIsInput;
      const peer = isReceive
        ? tx.inputs.map((i) => i.address).find((a) => a && a !== address)
        : tx.outputs
            .map((o, i) => (edicts.some((e) => e.output === i) ? o.address : undefined))
            .find((a) => a && a !== address);
      return {
        ...base,
        kind: isReceive ? "receive" : "send",
        legs,
        peer: peer ?? undefined,
      };
    }
  }

  // A protostone tx that didn't decode into alkane legs synchronously is
  // deferred: getActivity resolves it via outpoint balances / tx summary, and
  // when it carries NO message and moves NO alkanes (an inert protostone) it
  // falls back to a plain BTC transfer. The sync pass can't do those lookups,
  // so mark it "other" for now.
  if (protostones.length) return { ...base, kind: "other", legs: [] };

  // Plain (non-protostone) BTC movement.
  return { ...base, ...btcMovement(tx, address) };
}

/**
 * Classify a tx's net BTC movement from the address's perspective. Used for
 * plain (non-protostone) txs, and as the fallback for a protostone that has no
 * message and moves no alkanes (the dust/fee BTC delta is the real transfer).
 * A zero net delta (e.g. a self-consolidation the address merely funded) is a
 * generic "other".
 */
function btcMovement(
  tx: EspoEnrichedTx,
  address: string
): { kind: ActivityKind; legs: IActivityLeg[]; peer?: string } {
  const outToSelf = tx.outputs
    .filter((o) => o.address === address)
    .reduce((a, o) => a + (o.amount ?? 0), 0);
  const inFromSelf = tx.inputs
    .filter((i) => i.address === address)
    .reduce((a, i) => a + (i.amount ?? 0), 0);
  const delta = outToSelf - inFromSelf; // + received, - sent (incl. fee)

  if (delta === 0) return { kind: "other", legs: [] };

  const isReceive = delta > 0;
  const peer = isReceive
    ? tx.inputs.map((i) => i.address).find((a) => a && a !== address)
    : tx.outputs.map((o) => o.address).find((a) => a && a !== address);
  return {
    kind: isReceive ? "receive" : "send",
    legs: [{ assetId: "btc", delta: String(delta) }],
    peer: peer ?? undefined,
  };
}

class ApiController implements IApiController {
  /** The active network's espo RPC endpoint: the user's override or default */
  private get rpcUrl(): string {
    const network = storageService.appState.network;
    const slug = networkSlug(network);
    const override = storageService.appState.rpcUrl?.[slug];
    if (override && override.trim().length) {
      return override.trim().replace(/\/+$/, "");
    }
    return networkInfo(network).rpcUrl;
  }

  private call<T>(method: string, params: Record<string, unknown> = {}) {
    return espoRpc<T>(this.rpcUrl, method, params);
  }

  /** Fetch a normalized (pure-BTC) view of an address's spendable outpoints. */
  private async spendableOutpoints(
    address: string,
    withRawTx: boolean
  ): Promise<EspoSpendableOutpoint[] | undefined> {
    try {
      const res = await this.call<EspoSpendableOutpointsResult>(
        "essentials.get_address_spendable_outpoints",
        { address, omit_raw_tx: !withRawTx }
      );
      if (!res?.ok || !Array.isArray(res.outpoints)) return;
      // Never surface token-bearing outpoints to BTC coin selection: spending
      // one would burn its alkanes/runes.
      return res.outpoints.filter(isPureBtc);
    } catch {
      return;
    }
  }

  async getUtxos(address: string, params?: UtxoQueryParams) {
    const outpoints = await this.spendableOutpoints(address, true);
    if (!outpoints) return;

    let utxos: ApiUTXO[] = outpoints
      .map((o) => {
        const [txid, voutStr] = o.outpoint.split(":");
        return {
          txid,
          vout: Number(voutStr),
          value: o.value,
          status: {
            confirmed: o.confirmations > 0,
            block_height: o.block_height ?? 0,
            block_hash: "",
            block_time: 0,
          },
          hex: o.raw_tx_hex && o.raw_tx_hex !== "0" ? o.raw_tx_hex : undefined,
        } as ApiUTXO;
      })
      .sort((a, b) => b.value - a.value);

    // Emulate the old server-side selection: greedily pick the largest utxos
    // until the requested amount is covered.
    if (params?.amount !== undefined) {
      const selected: ApiUTXO[] = [];
      let sum = 0;
      for (const utxo of utxos) {
        selected.push(utxo);
        sum += utxo.value;
        if (sum >= params.amount) break;
      }
      utxos = selected;
    }

    return utxos;
  }

  async getFees() {
    try {
      const data = await this.call<EspoFeeEstimates>("fee_estimates");
      if (data && typeof data.fastestFee === "number") {
        return {
          fast: Math.max(Math.round(data.fastestFee), 1),
          slow: Math.max(Math.round(data.hourFee), 1),
        };
      }
    } catch {
      // fall through to defaults
    }
    return DEFAULT_FEES;
  }

  async pushTx(rawTx: string) {
    try {
      const data = await this.call<{ txid: string }>("broadcast_transaction", {
        raw_tx: rawTx,
      });
      if (data?.txid) return { txid: data.txid };
      return { error: "Broadcast failed" };
    } catch (e) {
      if (e instanceof EspoRpcError) {
        const detail =
          e.data && typeof e.data === "object" && "detail" in e.data
            ? String((e.data as { detail: unknown }).detail)
            : e.message;
        return { error: detail };
      }
      return { error: (e as Error).message };
    }
  }

  /**
   * Address tx history from espo. On page 1 we opt into espo's mempool
   * transactions (`include_mempool`) so pending sends/receives surface at the
   * top; a node without the esplora backend rejects that flag (ok:false), so we
   * transparently retry without it. Mempool txs only ever ride on page 1.
   */
  private async callAddressTxs(
    address: string,
    page: number,
    limit: number
  ): Promise<EspoAddressTransactionsResult | undefined> {
    const base = { address, page, limit, only_alkane_txs: false };
    if (page === 1) {
      const withMempool = await this.call<EspoAddressTransactionsResult>(
        "essentials.get_address_transactions",
        { ...base, include_mempool: true }
      ).catch(() => undefined);
      if (withMempool?.ok) return withMempool;
    }
    return this.call<EspoAddressTransactionsResult>(
      "essentials.get_address_transactions",
      base
    ).catch(() => undefined);
  }

  private async fetchTransactions(
    address: string,
    page: number
  ): Promise<ITransaction[] | undefined> {
    const res = await this.callAddressTxs(address, page, TX_PAGE_LIMIT);
    if (!res?.ok || !Array.isArray(res.transactions)) return;
    return res.transactions.map(mapEspoTx);
  }

  async getTransactions(address: string): Promise<ITransaction[] | undefined> {
    return this.fetchTransactions(address, 1);
  }

  async getPaginatedTransactions(
    address: string,
    page: number
  ): Promise<ITransaction[] | undefined> {
    return this.fetchTransactions(address, page);
  }

  async getLastBlock() {
    try {
      const data = await this.call<{ height: number }>("get_espo_height");
      if (data && typeof data.height === "number") return data.height;
    } catch {
      // ignore
    }
    return undefined;
  }

  async getBTCPrice(): Promise<number | undefined> {
    // espo's ammdata price index (USD scaled by 10^16). Returns undefined when
    // the ammdata module is not enabled on this endpoint (e.g. regtest).
    try {
      const data = await this.call<EspoBtcUsdPriceResult>(
        "ammdata.get_btc_usd_price"
      );
      if (data?.ok && data.price) {
        const usd = Number(data.price) / PRICE_SCALE;
        if (Number.isFinite(usd) && usd > 0) return usd;
      }
    } catch {
      // ammdata module unavailable; no price.
    }
    return undefined;
  }

  async getPortfolioStats(address: string): Promise<IPortfolio | undefined> {
    try {
      const res = await this.call<EspoPortfolioStatsResult>(
        "ammdata.get_portfolio_stats",
        { address }
      );
      if (!res?.ok || !res.assets) return undefined;

      const parse = (id: string, a: EspoPortfolioAsset): IPortfolioAsset => ({
        id,
        name: a.name,
        symbol: a.symbol,
        balance: a.balance,
        priceUsd: a.price_now_usd != null ? Number(a.price_now_usd) : null,
        valueUsd: a.value_now_usd != null ? Number(a.value_now_usd) : null,
        change24h: a.change_24h != null ? Number(a.change_24h) : null,
        valueChangeUsd24h:
          a.value_change_24h_usd != null
            ? Number(a.value_change_24h_usd)
            : null,
      });

      const btcRow = res.assets["btc"];
      const alkanes = Object.entries(res.assets)
        .filter(([id]) => id !== "btc")
        .map(([id, a]) => parse(id, a))
        // Priced assets first (by USD value desc), then unpriced.
        .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

      return {
        address: res.address ?? address,
        totalValueUsd: Number(res.total_value_usd ?? 0),
        change24h: res.change_24h != null ? Number(res.change_24h) : null,
        changeUsd24h:
          res.change_24h_usd != null ? Number(res.change_24h_usd) : null,
        complete: !!res.complete,
        btc: btcRow ? parse("btc", btcRow) : null,
        alkanes,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Unified activity feed for the activity tab: espo's semantic alkane feed
   * (`tokendata.get_address_activity` — swaps, LP add/remove, pool creation,
   * mints) merged with plain BTC sends/receives from the tx history, deduped
   * by txid (the semantic entry wins), newest first.
   */
  async getActivity(
    address: string,
    page: number
  ): Promise<IActivityEntry[] | undefined> {
    const limit = 25;
    const [alkaneRes, rawTxs] = await Promise.all([
      this.call<EspoAddressActivityResult>("tokendata.get_address_activity", {
        address,
        page,
        limit,
        dir: "desc",
      }).catch(() => undefined),
      this.callAddressTxs(address, page, limit),
    ]);

    // The tx history is the base feed; if it failed, treat as a load error.
    if (!rawTxs?.ok || !Array.isArray(rawTxs.transactions)) return undefined;

    const entries: IActivityEntry[] = [];
    const seen = new Set<string>();
    // tokendata sometimes labels a swap/wrap as a "mint" (e.g. a swap that also
    // mints DIESEL, or a wrap). Re-check each mint against its trace.
    const needMintCheck: IActivityEntry[] = [];

    if (alkaneRes?.ok && Array.isArray(alkaneRes.entries)) {
      for (const e of alkaneRes.entries) {
        // tokendata emits one row per token, so a swap/LP tx appears twice
        // (mirrored by token/counter_token); the first row already carries both
        // legs, so skip any later row with the same txid.
        if (seen.has(e.txid)) continue;
        seen.add(e.txid);
        (e.chain_txids ?? []).forEach((t) => seen.add(t));
        const entry = mapAlkaneActivity(e);
        entries.push(entry);
        if (entry.kind === "mint") needMintCheck.push(entry);
      }
    }

    // Protostone txs need a second lookup. A CONTRACT CALL (protostone with a
    // non-empty message) is a swap / wrap / unwrap / funded op: tokendata
    // indexes swaps under the RECEIVING address, so one the wallet only FUNDED
    // isn't in its feed — recover it from the net alkane outflow + traces. We
    // route EVERY message-bearing tx here (not just kind "other"): a wrap/unwrap
    // pays the frBTC via an edict, so the sync classifier may have mislabeled it
    // a plain send/receive. A pure TRANSFER (edicts/pointer, NO message) that
    // stayed "other" is a "transfer all" (amount 0) or pointer we resolve from
    // the destination output's alkane balance.
    const needSummary: { entry: IActivityEntry; tx: EspoEnrichedTx }[] = [];
    const needTransfer: { entry: IActivityEntry; tx: EspoEnrichedTx }[] = [];
    for (const tx of rawTxs.transactions) {
      if (seen.has(tx.txid)) continue;
      const entry = mapRawTxActivity(tx, address);
      entries.push(entry);
      const protostones = tx.runestone?.protostones ?? [];
      if (!protostones.length) continue;
      if (protostones.some((p) => p.message && p.message.length > 0)) {
        needSummary.push({ entry, tx });
      } else if (entry.kind === "other") {
        needTransfer.push({ entry, tx });
      }
    }

    await Promise.all([
      ...needSummary.map(async ({ entry, tx }) => {
        const summary = await this.alkaneTxSummary(entry.txid);
        // A mempool tx has no summary yet; a frBTC wrap/unwrap is still fully
        // classifiable from its cellpack so it never flashes "App Interaction".
        const inferred =
          (summary && activityFromOutflow(summary)) ??
          frbtcCellpackActivity(tx, address);
        if (inferred) {
          entry.kind = inferred.kind;
          entry.legs = inferred.legs;
        }
      }),
      ...needMintCheck.map(async (entry) => {
        const summary = await this.alkaneTxSummary(entry.txid);
        const inferred = summary && activityFromOutflow(summary);
        // Only correct a mislabeled swap/wrap/unwrap. A genuine mint's net
        // movement reads as a "receive", so never let that override the mint.
        if (
          inferred &&
          (inferred.kind === "buy" ||
            inferred.kind === "wrap" ||
            inferred.kind === "unwrap")
        ) {
          entry.kind = inferred.kind;
          entry.legs = inferred.legs;
        }
      }),
      ...needTransfer.map(async ({ entry, tx }) => {
        const resolved = await this.resolveEdictTransfer(tx, address);
        if (resolved) {
          entry.kind = resolved.kind;
          entry.legs = resolved.legs;
          entry.peer = resolved.peer;
        } else {
          // No message and no alkane movement: the protostone is inert, so the
          // tx is really a plain BTC transfer (or a no-op "other").
          const btc = btcMovement(tx, address);
          entry.kind = btc.kind;
          entry.legs = btc.legs;
          entry.peer = btc.peer;
        }
      }),
    ]);

    // Unconfirmed first, then newest first.
    entries.sort((a, b) => {
      if (a.confirmed !== b.confirmed) return a.confirmed ? 1 : -1;
      return b.timestamp - a.timestamp;
    });

    return entries;
  }

  /**
   * Price candles (USD close) for a token's chart via ammdata.get_candles.
   * DIESEL (2:0) and FIRE (2:77623) price off their direct `<id>-usd` pool;
   * every other alkane off the DIESEL-derived USD leg `<id>-derived_2:0-usd`.
   *
   * BTC and frBTC (32:0) use espo's native indexed BTC/USD history
   * (ammdata.get_btc_usd_candles); frBTC is pegged 1:1 to BTC.
   *
   * Returned oldest-first for charting.
   */
  async getCandles(
    assetId: string,
    timeframe: string,
    limit: number
  ): Promise<ICandle[] | undefined> {
    if (assetId === "btc" || assetId === "32:0") {
      return this.btcCandles(timeframe, limit);
    }
    const direct = assetId === "2:0" || assetId === "2:77623";
    const pool = direct ? `${assetId}-usd` : `${assetId}-derived_2:0-usd`;
    const rows = await this.poolCandles(pool, timeframe, limit);
    if (!rows) return undefined;
    return rows
      .map((r) => ({ ts: r.ts, price: r.val }))
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * Espo's native BTC/USD candle index. It only supports 10m/1h/4h/1d/1w/1M, so
   * the requested (timeframe, limit) is mapped to the nearest supported bucket
   * while preserving the total time window.
   */
  private async btcCandles(
    timeframe: string,
    limit: number
  ): Promise<ICandle[] | undefined> {
    const TF_SECS: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "10m": 600,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
      "1w": 604800,
      "1M": 2592000,
    };
    // Sub-hourly requests collapse to the 10m bucket (the finest BTC supports).
    const BTC_TF: Record<string, string> = {
      "1m": "10m",
      "5m": "10m",
      "10m": "10m",
      "15m": "10m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      "1w": "1w",
      "1M": "1M",
    };
    const tf = BTC_TF[timeframe] ?? "1h";
    const window = (TF_SECS[timeframe] ?? 3600) * limit;
    const btcLimit = Math.max(2, Math.ceil(window / (TF_SECS[tf] ?? 3600)));
    try {
      const res = await this.call<{
        ok: boolean;
        candles?: { ts: number; close: string }[];
      }>("ammdata.get_btc_usd_candles", { timeframe: tf, limit: btcLimit });
      if (!res?.ok || !Array.isArray(res.candles)) return undefined;
      return res.candles
        .map((c) => ({ ts: Number(c.ts) || 0, price: scaleUsd(c.close) }))
        .filter((c) => c.ts > 0 && Number.isFinite(c.price))
        .sort((a, b) => a.ts - b.ts);
    } catch {
      return undefined;
    }
  }

  /** Raw {ts, USD-scaled close} rows for a candle pool (unsorted). */
  private async poolCandles(
    pool: string,
    timeframe: string,
    limit: number
  ): Promise<{ ts: number; val: number }[] | undefined> {
    try {
      const res = await this.call<{
        ok: boolean;
        candles?: { ts: number; close: string }[];
      }>("ammdata.get_candles", { pool, timeframe, limit });
      if (!res?.ok || !Array.isArray(res.candles)) return undefined;
      return res.candles
        .map((c) => ({ ts: Number(c.ts) || 0, val: scaleUsd(c.close) }))
        .filter((c) => c.ts > 0 && Number.isFinite(c.val));
    } catch {
      return undefined;
    }
  }

  /** Deploy height/time/txid + holder count via essentials.get_alkane_info. */
  async getAlkaneMeta(assetId: string): Promise<IAlkaneMeta | undefined> {
    if (assetId === "btc") return undefined;
    try {
      const res = await this.call<{
        alkane?: string;
        creation_height?: number;
        creation_timestamp?: number;
        creation_txid?: string;
        holder_count?: number;
        ok?: boolean;
      }>("essentials.get_alkane_info", { alkane: assetId });
      if (!res || res.creation_txid === undefined) return undefined;
      return {
        creationHeight: res.creation_height ?? 0,
        creationTimestamp: res.creation_timestamp ?? 0,
        creationTxid: res.creation_txid,
        holderCount: res.holder_count ?? 0,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * The contract ABI/creation display info for an alkane via
   * essentials.get_alkane_info. Mirrors espo's explorer name/method resolution:
   * the display name is inspection.metadata.name (the ABI name) when non-empty,
   * else the top-level creation-record name; each method exposes its opcode +
   * name so a contract call can be labelled. Full upgradeable-proxy resolution
   * (following /implementation to another alkane's ABI) is NOT exposed here, so
   * a proxy's own ABI (e.g. the Oyl AMM at 4:65522) is empty — callers keep the
   * hardcoded overrides/opcode fallbacks for those.
   */
  async getAlkaneInfo(
    id: string
  ): Promise<
    | { name?: string; methods: { opcode: number; name: string }[]; factory?: string }
    | undefined
  > {
    const direct = await this.alkaneInfoOnce(id);
    if (!direct) return undefined;
    /*
      An Upgradeable proxy's own ABI is just initialize/upgrade/forward; the
      real contract lives at the alkane its /implementation (or /beacon)
      storage slot points to. Espo resolves it the same way (tx_view.rs), so a
      factory call shows "swap_exact_tokens_for_tokens" instead of the proxy.
    */
    if (isUpgradeableProxy(direct.methods)) {
      const implId = await this.proxyImplementation(id);
      if (implId && implId !== id) {
        const impl = await this.alkaneInfoOnce(implId);
        if (impl && impl.methods.length) {
          return {
            name: impl.name ?? direct.name,
            methods: impl.methods,
            factory: direct.factory,
          };
        }
      }
    }
    return direct;
  }

  /** One get_alkane_info fetch, no proxy chasing. */
  private async alkaneInfoOnce(
    id: string
  ): Promise<
    | { name?: string; methods: { opcode: number; name: string }[]; factory?: string }
    | undefined
  > {
    try {
      const res = await this.call<{
        ok?: boolean;
        name?: string;
        inspection?: {
          metadata?: {
            name?: string;
            methods?: { name?: string; opcode?: number | string }[];
          } | null;
          factory_alkane?: string | null;
        } | null;
      }>("essentials.get_alkane_info", { alkane: id });
      if (!res?.ok) return undefined;
      const meta = res.inspection?.metadata ?? undefined;
      const abiName = meta?.name && meta.name.length ? meta.name : undefined;
      const methods: { opcode: number; name: string }[] = (meta?.methods ?? [])
        .filter((m) => m.name != null && m.opcode != null)
        .map((m) => ({ opcode: Number(BigInt(m.opcode!)), name: String(m.name) }));
      return {
        name: abiName ?? (res.name || undefined),
        methods,
        factory: res.inspection?.factory_alkane ?? undefined,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * The implementation id behind an Upgradeable proxy: the /implementation
   * (fallback /beacon) storage slot, 32 bytes of two little-endian u128s.
   */
  private async proxyImplementation(id: string): Promise<string | undefined> {
    try {
      const res = await this.call<{
        ok?: boolean;
        items?: Record<string, { value_hex?: string | null }>;
      }>("essentials.get_keys", {
        alkane: id,
        keys: ["/implementation", "/beacon"],
      });
      if (!res?.ok || !res.items) return undefined;
      const hex = (
        res.items["/implementation"]?.value_hex ||
        res.items["/beacon"]?.value_hex ||
        ""
      ).replace(/^0x/, "");
      if (hex.length < 64) return undefined;
      const le = (h: string) => {
        let v = 0n;
        for (let i = h.length - 2; i >= 0; i -= 2) {
          v = (v << 8n) | BigInt(parseInt(h.slice(i, i + 2), 16));
        }
        return v;
      };
      const block = le(hex.slice(0, 32));
      const tx = le(hex.slice(32, 64));
      if (block > 0xffffffffn || tx > 0xffffffffffffffffn) return undefined;
      return `${block}:${tx}`;
    } catch {
      return undefined;
    }
  }

  /** Whitelisted tokens with price/mcap/24h-change, ranked by 24h volume. */
  async getTrendingTokens(): Promise<ITokenSummary[] | undefined> {
    const bases = TRENDING_TOKEN_IDS.map((id) => ({
      id,
      name: KNOWN_ALKANES[id]?.name ?? id,
      symbol: KNOWN_ALKANES[id]?.symbol ?? id,
    }));
    const rows = await this.tokenSummaries(bases);
    return rows?.sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
  }

  /** Prefix search (essentials.search_alkane) enriched with price/mcap/change. */
  async searchTokens(prefix: string): Promise<ITokenSummary[] | undefined> {
    const q = prefix.trim();
    if (!q) return [];
    // An exact alkane id ("block:tx") skips the name/symbol search and renders
    // just that token (names come from get_alkane_info or the known list).
    if (/^\d+:\d+$/.test(q)) {
      const info = await this.call<{ name?: string; symbol?: string }>(
        "essentials.get_alkane_info",
        { alkane: q }
      ).catch(() => undefined);
      const name = info?.name || KNOWN_ALKANES[q]?.name || q;
      const symbol = (
        info?.symbol ||
        KNOWN_ALKANES[q]?.symbol ||
        q
      ).toUpperCase();
      return this.tokenSummaries([{ id: q, name, symbol }]);
    }
    try {
      const res = await this.call<{
        ok: boolean;
        items?: { alkane: string; name?: string; symbol?: string }[];
      }>("essentials.search_alkane", { prefix: q, limit: 20 });
      if (!res?.ok || !Array.isArray(res.items)) return undefined;
      const bases = res.items.map((i) => ({
        id: i.alkane,
        name: i.name || i.symbol || i.alkane,
        symbol: (i.symbol || i.name || i.alkane).toUpperCase(),
      }));
      return this.tokenSummaries(bases);
    } catch {
      return undefined;
    }
  }

  /**
   * Everything the UI's contract projection (espo's mempool estimation model,
   * ported for frBTC + the AMM) needs: the live signer script and every
   * pool's pair + reserves. One get_pools sweep + one get_signer call.
   */
  async getProjectionData(): Promise<
    | {
        signerScriptHex?: string;
        pools: Record<
          string,
          { base: string; quote: string; baseReserve: string; quoteReserve: string }
        >;
      }
    | undefined
  > {
    try {
      const [pools, signer] = await Promise.all([
        this.allPools().catch(() => ({}) as Record<string, EspoPool>),
        this.call<{ ok: boolean; script_pubkey?: string }>(
          "subfrost.get_signer"
        ).catch(() => undefined),
      ]);
      const mapped: Record<
        string,
        { base: string; quote: string; baseReserve: string; quoteReserve: string }
      > = {};
      for (const [id, p] of Object.entries(pools)) {
        mapped[id] = {
          base: p.base,
          quote: p.quote,
          baseReserve: p.base_reserve ?? "0",
          quoteReserve: p.quote_reserve ?? "0",
        };
      }
      return {
        ...(signer?.ok && signer.script_pubkey
          ? {
              signerScriptHex: signer.script_pubkey
                .replace(/^0x/, "")
                .toLowerCase(),
            }
          : {}),
        pools: mapped,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Every token id ("block:tx") that sits in at least one AMM pool - the set
   * of assets that can actually be swapped. Derived from ammdata.get_pools.
   */
  async getPoolTokenIds(): Promise<string[] | undefined> {
    try {
      const pools = await this.allPools();
      const ids = new Set<string>();
      for (const p of Object.values(pools)) {
        if (p.base) ids.add(p.base);
        if (p.quote) ids.add(p.quote);
      }
      return [...ids];
    } catch {
      return undefined;
    }
  }

  /**
   * The address's subfrost unwrap requests (frBTC -> BTC), newest first, one
   * page of UNWRAP_PAGE_LIMIT. Espo only indexes CONFIRMED unwraps, so every
   * row here is "confirmed" or "fulfilled"; mempool unwraps (the "unconfirmed"
   * state) are surfaced by the caller from the activity feed instead.
   * NOTE: the subfrost module's success envelope has NO `ok` field.
   */
  async getUnwrapRequests(
    address: string,
    page: number
  ): Promise<IUnwrapRequest[] | undefined> {
    try {
      const res = await this.call<{
        ok?: boolean;
        error?: string;
        items?: {
          txid: string;
          vout: number;
          timestamp: number;
          amount: string;
          address_spk: string;
          fulfilled: boolean;
          fulfillment_tx: string | null;
        }[];
        total?: number;
      }>("subfrost.get_unwrap_requests_by_address", {
        address,
        count: UNWRAP_PAGE_LIMIT,
        offset: (page - 1) * UNWRAP_PAGE_LIMIT,
      });
      if (res?.ok === false || !Array.isArray(res?.items)) return undefined;
      return res.items.map((r) => ({
        txid: r.txid,
        vout: r.vout,
        timestamp: r.timestamp,
        amount: String(r.amount),
        state: r.fulfilled ? ("fulfilled" as const) : ("confirmed" as const),
        ...(r.fulfillment_tx ? { fulfillmentTxid: r.fulfillment_tx } : {}),
      }));
    } catch {
      return undefined;
    }
  }

  /**
   * Fill price + 24h change + market cap + 24h volume for a set of token bases
   * in a single batched RPC round-trip. Price/change/volume come from the token's
   * hourly USD candles (24h window); market cap from its `-mcusd` candles.
   */
  private async tokenSummaries(
    bases: { id: string; name: string; symbol: string }[]
  ): Promise<ITokenSummary[] | undefined> {
    if (!bases.length) return [];
    const calls = bases.flatMap((b) => [
      {
        method: "ammdata.get_candles",
        params: { pool: tokenPricePool(b.id), timeframe: "1h", limit: 25 },
      },
      {
        method: "ammdata.get_candles",
        params: { pool: tokenMcapPool(b.id), timeframe: "1d", limit: 2 },
      },
    ]);
    try {
      const res = await espoRpcBatch<EspoCandleRes>(this.rpcUrl, calls);
      return bases.map((b, i) => {
        const priceRes = res[i * 2];
        const mcapRes = res[i * 2 + 1];
        const { price, change } = priceChangeFromCandles(priceRes);
        const mcapVals = usdClosesFromCandles(mcapRes);
        return {
          id: b.id,
          name: b.name,
          symbol: b.symbol,
          priceUsd: price,
          change24h: change,
          marketCapUsd: mcapVals.length ? mcapVals[mcapVals.length - 1] : null,
          volumeUsd: candleVolumeSum(priceRes),
        };
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Net alkane movement {id: amount} for a tx via get_alkane_tx_summary, plus
   * whether any trace minted/deployed an alkane (a `create` event) — which
   * disqualifies the tx from being read as a plain swap.
   */
  private async alkaneTxSummary(
    txid: string
  ): Promise<AlkaneTxSummary | undefined> {
    try {
      const res = await this.call<EspoTxSummary>(
        "essentials.get_alkane_tx_summary",
        { txid }
      );
      if (!res?.ok || !Array.isArray(res.outflows)) return undefined;
      const net: Record<string, number> = {};
      for (const o of res.outflows) {
        for (const [id, amt] of Object.entries(o.outflow ?? {})) {
          net[id] = (net[id] ?? 0) + Number(amt);
        }
      }
      const events = (res.traces ?? []).flatMap(
        (tr) => tr.events ?? tr.trace?.events ?? []
      );
      const hasCreate = events.some((e) => e.event === "create");
      // Scan invokes for two signals: a frBTC wrap/unwrap (invoke of the frBTC
      // synth 32:0 with opcode 0x4d/0x4e), and an AMM swap (invoke of a block-4
      // factory router with a swap opcode 13/14).
      let frbtc: "wrap" | "unwrap" | undefined;
      let isSwap = false;
      for (const e of events) {
        if (e.event !== "invoke") continue;
        const ctx = e.data?.context;
        const m = ctx?.myself;
        if (!m) continue;
        const block = parseInt(m.block ?? "", 16);
        const op = parseInt((ctx?.inputs ?? [])[0] ?? "", 16);
        if (block === FRBTC_CONTRACT.block && parseInt(m.tx ?? "", 16) === FRBTC_CONTRACT.tx) {
          if (op === FRBTC_WRAP_OP) frbtc = "wrap";
          else if (op === FRBTC_UNWRAP_OP) frbtc = "unwrap";
        } else if (block === AMM_FACTORY_BLOCK && AMM_SWAP_OPS.has(op)) {
          isSwap = true;
        }
      }
      // A frBTC wrap/unwrap burns/mints frBTC against BTC, so get_alkane_tx_summary
      // frequently reports NO net alkane outflow (empty `outflows`). Recover the
      // frBTC amount from the trace: what entered the frBTC frame minus what it
      // returned, so the entry still carries a leg AND classifies as wrap/unwrap.
      if (frbtc && net[FRBTC_ID] === undefined) {
        const sumFrbtc = (arr?: EspoTraceAlkane[]) =>
          (arr ?? []).reduce((acc, x) => {
            const b = parseInt(x.id?.block ?? "", 16);
            const tx = parseInt(x.id?.tx ?? "", 16);
            return b === FRBTC_CONTRACT.block && tx === FRBTC_CONTRACT.tx
              ? acc + parseInt(x.value ?? "0", 16)
              : acc;
          }, 0);
        let incoming = 0;
        let returned = 0;
        for (const e of events) {
          if (e.event === "invoke") {
            const m = e.data?.context?.myself;
            if (
              m &&
              parseInt(m.block ?? "", 16) === FRBTC_CONTRACT.block &&
              parseInt(m.tx ?? "", 16) === FRBTC_CONTRACT.tx
            ) {
              incoming += sumFrbtc(e.data?.context?.incomingAlkanes);
            }
          } else if (e.event === "return") {
            returned = sumFrbtc(e.data?.response?.alkanes); // last return wins
          }
        }
        const delta = incoming - returned;
        if (delta !== 0) net[FRBTC_ID] = delta;
      }
      if (
        !Object.keys(net).length &&
        !frbtc &&
        !isSwap &&
        !hasCreate
      ) {
        return undefined;
      }
      return { net, hasCreate, frbtc, isSwap };
    } catch {
      return undefined;
    }
  }

  /** Alkane balances {id: amount} sitting at an outpoint (empty once spent). */
  /**
   * Alkane balances for a set of outpoints ("txid:vout"), keyed by outpoint,
   * with amounts as raw 8-decimal strings (u128-safe). Used by the transaction
   * overview to show what each input holds. Missing/empty outpoints are omitted.
   */
  async getOutpointAlkanes(
    outpoints: string[]
  ): Promise<Record<string, { alkane: string; amount: string }[]>> {
    const out: Record<string, { alkane: string; amount: string }[]> = {};
    await Promise.all(
      outpoints.map(async (outpoint) => {
        try {
          const res = await this.call<{
            ok: boolean;
            items?: { entries?: { alkane: string; amount: string }[] }[];
          }>("essentials.get_outpoint_balances", { outpoint });
          if (!res?.ok || !Array.isArray(res.items)) return;
          const entries: { alkane: string; amount: string }[] = [];
          for (const it of res.items) {
            for (const e of it.entries ?? []) {
              entries.push({ alkane: e.alkane, amount: String(e.amount) });
            }
          }
          if (entries.length) out[outpoint] = entries;
        } catch {
          // per-outpoint failures are non-fatal
        }
      })
    );
    return out;
  }

  /**
   * BTC value (sats) for each requested outpoint, keyed by outpoint. Reads the
   * current account's spendable outpoints WITHOUT the pure-BTC filter, so an
   * alkane-bearing input still reports its sat value (unlike getUtxoValues).
   */
  /**
   * Every AMM pool with its live reserves, from espo's ammdata index. This
   * deliberately avoids simulating the factory (opcode 2 / 97): simulation is
   * unreliable on some nodes, and espo already indexes pools + reserves.
   */
  private async allPools(): Promise<Record<string, EspoPool>> {
    const pools: Record<string, EspoPool> = {};
    for (let page = 1; page <= 10; page++) {
      const res = await this.call<EspoPoolsResult>("ammdata.get_pools", {
        page,
        limit: 500,
      });
      if (!res?.ok || !res.pools) break;
      Object.assign(pools, res.pools);
      if (!res.has_more) break;
    }
    return pools;
  }

  /**
   * A pool alkane's live reserves: its own on-chain alkane balances, keyed by
   * token id ("block:tx"). Preferred over the indexed reserve snapshot.
   */
  private async poolReserves(
    poolId: string
  ): Promise<Record<string, string> | undefined> {
    try {
      const res = await this.call<{
        ok: boolean;
        balances?: Record<string, string>;
      }>("essentials.get_alkane_balances", { alkane: poolId });
      if (!res?.ok || !res.balances) return undefined;
      return res.balances;
    } catch {
      return undefined;
    }
  }

  /**
   * The pool holding exactly this unordered pair, with reserves oriented. The
   * pair mapping comes from the pool index, but the RESERVES are read live from
   * the pool's own alkane balances — and since that map is keyed by token id,
   * the in/out orientation is unambiguous (no base/quote guessing).
   */
  private async findPool(
    sellId: string,
    buyId: string
  ): Promise<
    { poolId: string; reserveIn: bigint; reserveOut: bigint } | undefined
  > {
    const pools = await this.allPools();
    for (const [poolId, p] of Object.entries(pools)) {
      const pair = new Set([p.base, p.quote]);
      if (!pair.has(sellId) || !pair.has(buyId)) continue;

      const balances = await this.poolReserves(poolId);
      if (!balances) continue;
      const reserveIn = BigInt(balances[sellId] ?? "0");
      const reserveOut = BigInt(balances[buyId] ?? "0");
      if (reserveIn <= 0n || reserveOut <= 0n) continue;

      return { poolId, reserveIn, reserveOut };
    }
    return undefined;
  }

  /**
   * The best multi-hop route for a pair from espo's ammdata pathfinder, as
   * {path (token ids, sell..buy), pools (one per hop)}. Falls back to the
   * direct pair when the RPC is unavailable or returns nothing.
   */
  private async bestSwapRoute(
    sellId: string,
    buyId: string,
    amount: bigint,
    exactOut: boolean
  ): Promise<{ path: string[]; pools: string[] } | undefined> {
    try {
      const res = await this.call<{
        ok?: boolean;
        hops?: {
          pool: string;
          token_in: string;
          token_out: string;
        }[];
      }>("ammdata.find_best_swap_path", {
        mode: exactOut ? "exact_out" : "exact_in",
        token_in: sellId,
        token_out: buyId,
        ...(exactOut
          ? { amount_out: amount.toString() }
          : { amount_in: amount.toString() }),
      });
      if (
        res?.ok &&
        Array.isArray(res.hops) &&
        res.hops.length &&
        res.hops[0].token_in === sellId &&
        res.hops[res.hops.length - 1].token_out === buyId
      ) {
        return {
          path: [sellId, ...res.hops.map((h) => h.token_out)],
          pools: res.hops.map((h) => h.pool),
        };
      }
    } catch {
      // fall through to the direct pair
    }
    const direct = await this.findPool(sellId, buyId);
    if (!direct) return undefined;
    return { path: [sellId, buyId], pools: [direct.poolId] };
  }

  /**
   * Emulate a route hop by hop against each pool's LIVE reserves
   * (get_alkane_balances). Exact-in walks forward; exact-out walks backward
   * through quoteExactOut so the returned input actually covers the request.
   */
  private async emulateSwapPath(
    pools: string[],
    path: string[],
    amount: bigint,
    exactOut: boolean
  ): Promise<{ amountIn: bigint; amountOut: bigint } | undefined> {
    if (pools.length !== path.length - 1 || amount <= 0n) return undefined;
    const balances = await Promise.all(
      pools.map((poolId) => this.poolReserves(poolId))
    );
    const reserveAt = (hop: number): [bigint, bigint] | undefined => {
      const b = balances[hop];
      if (!b) return undefined;
      const rIn = BigInt(b[path[hop]] ?? "0");
      const rOut = BigInt(b[path[hop + 1]] ?? "0");
      return rIn > 0n && rOut > 0n ? [rIn, rOut] : undefined;
    };
    const feePer1000 = DEFAULT_POOL_FEE_PER_1000;

    if (!exactOut) {
      let amt = amount;
      for (let i = 0; i < pools.length; i++) {
        const r = reserveAt(i);
        if (!r) return undefined;
        amt = quoteExactIn({
          amountIn: amt,
          reserveIn: r[0],
          reserveOut: r[1],
          feePer1000,
        });
        if (amt <= 0n) return undefined;
      }
      return { amountIn: amount, amountOut: amt };
    }

    let amt = amount;
    for (let i = pools.length - 1; i >= 0; i--) {
      const r = reserveAt(i);
      if (!r) return undefined;
      if (amt >= r[1]) return undefined;
      amt = quoteExactOut({
        amountOut: amt,
        reserveIn: r[0],
        reserveOut: r[1],
        feePer1000,
      });
      if (amt <= 0n) return undefined;
    }
    return { amountIn: amt, amountOut: amount };
  }

  /**
   * Quote one side of the swap form, in either direction.
   *
   * `exactOut: false` (default) treats `rawAmount` as what the user pays and
   * returns what they receive; `exactOut: true` treats it as the amount they
   * want to receive and returns the input required.
   *
   * BTC is not an alkane, so a BTC leg routes through frBTC: BTC->token wraps
   * first (minus the wrap premium) then swaps, token->BTC swaps to frBTC then
   * unwraps 1:1. A BTC<->frBTC pair has no pool leg at all. Returns undefined
   * when no pool exists for the pair.
   */
  async getSwapQuote(
    fromId: string,
    toId: string,
    rawAmount: string,
    exactOut = false
  ): Promise<ISwapQuote | undefined> {
    try {
      const amount = BigInt(rawAmount);
      if (amount <= 0n) return undefined;

      const frbtcKey = alkaneIdKey(FRBTC_ALKANE_ID);
      const fromIsBtc = fromId === "btc";
      const toIsBtc = toId === "btc";
      if (fromIsBtc && toIsBtc) return undefined;

      const provider = espoProvider();
      const premiumOf = async () => {
        const p = await getFrbtcPremium(provider);
        return isBoxedError(p) ? 0n : p.data;
      };

      // BTC -> frBTC is a plain wrap (premium deducted); frBTC -> BTC is a 1:1
      // unwrap. Neither touches a pool.
      if (fromIsBtc && toId === frbtcKey) {
        const premium = await premiumOf();
        if (exactOut) {
          // Gross the requested output back up through the premium.
          const denom = FRBTC_PREMIUM_DENOMINATOR;
          const grossed =
            premium > 0n
              ? (amount * denom + (denom - premium) - 1n) / (denom - premium)
              : amount;
          return {
            amountIn: grossed.toString(),
            amountOut: amount.toString(),
            viaFrbtc: true,
          };
        }
        return {
          amountIn: amount.toString(),
          amountOut: applyFrbtcPremium(amount, premium).toString(),
          viaFrbtc: true,
        };
      }
      if (fromId === frbtcKey && toIsBtc) {
        return {
          amountIn: amount.toString(),
          amountOut: amount.toString(),
          viaFrbtc: true,
        };
      }

      // Everything else has an AMM leg. Map each BTC side onto frBTC.
      const sellId = fromIsBtc ? frbtcKey : fromId;
      const buyId = toIsBtc ? frbtcKey : toId;
      if (sellId === buyId) return undefined;

      if (exactOut) {
        // The route must output exactly what the user asked for (token->BTC
        // unwraps 1:1, so the route target equals the requested BTC).
        const route = await this.bestSwapRoute(sellId, buyId, amount, true);
        if (!route) return undefined;
        const legs = await this.emulateSwapPath(
          route.pools,
          route.path,
          amount,
          true
        );
        if (!legs) return undefined;
        // A BTC input is wrapped first, so gross the route input up through
        // the premium to get the BTC the user must actually pay.
        let amountIn = legs.amountIn;
        if (fromIsBtc) {
          const premium = await premiumOf();
          const denom = FRBTC_PREMIUM_DENOMINATOR;
          amountIn =
            premium > 0n
              ? (amountIn * denom + (denom - premium) - 1n) / (denom - premium)
              : amountIn;
        }
        return {
          amountIn: amountIn.toString(),
          amountOut: amount.toString(),
          poolId: route.pools[0],
          path: route.path,
          viaFrbtc: fromIsBtc || toIsBtc,
        };
      }

      // Exact-in: a BTC input is wrapped first, so the route only ever sees
      // the post-premium amount.
      let poolIn = amount;
      if (fromIsBtc) poolIn = applyFrbtcPremium(amount, await premiumOf());

      const route = await this.bestSwapRoute(sellId, buyId, poolIn, false);
      if (!route) return undefined;
      const legs = await this.emulateSwapPath(
        route.pools,
        route.path,
        poolIn,
        false
      );
      if (!legs) return undefined;

      return {
        amountIn: amount.toString(),
        amountOut: legs.amountOut.toString(),
        poolId: route.pools[0],
        path: route.path,
        viaFrbtc: fromIsBtc || toIsBtc,
      };
    } catch {
      return undefined;
    }
  }

  async getOutpointValues(
    outpoints: string[]
  ): Promise<Record<string, number>> {
    const address = storageService.currentAccount?.address;
    if (!address) return {};
    try {
      const res = await this.call<EspoSpendableOutpointsResult>(
        "essentials.get_address_spendable_outpoints",
        { address, omit_raw_tx: true }
      );
      if (!res?.ok || !Array.isArray(res.outpoints)) return {};
      const byOutpoint = new Map(res.outpoints.map((o) => [o.outpoint, o.value]));
      const out: Record<string, number> = {};
      for (const op of outpoints) {
        const v = byOutpoint.get(op);
        if (v != null) out[op] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  private async outpointAlkanes(
    outpoint: string
  ): Promise<Record<string, number> | undefined> {
    try {
      const res = await this.call<{
        ok: boolean;
        items?: { entries?: { alkane: string; amount: string }[] }[];
      }>("essentials.get_outpoint_balances", { outpoint });
      if (!res?.ok || !Array.isArray(res.items)) return undefined;
      const net: Record<string, number> = {};
      for (const it of res.items) {
        for (const e of it.entries ?? []) {
          net[e.alkane] = (net[e.alkane] ?? 0) + Number(e.amount);
        }
      }
      return Object.keys(net).length ? net : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve a pure alkane transfer (protostone with edicts/pointer, no message)
   * from the ADDRESS's perspective. Each edict/pointer names a destination vout
   * and an amount (a `0` amount means "transfer all"); zero-amount and pointer
   * destinations are resolved from what actually landed there via
   * `get_outpoint_balances`. Then, by owner of the destinations:
   *   - alkanes to a non-user output while the user spends = SEND
   *   - alkanes to the user's output while the user isn't spending = RECEIVE
   *   - alkanes the user spreads across 2+ of ITS OWN outputs = SPLIT
   */
  private async resolveEdictTransfer(
    tx: EspoEnrichedTx,
    address: string
  ): Promise<
    { kind: ActivityKind; legs: IActivityLeg[]; peer?: string } | undefined
  > {
    const protostones = tx.runestone?.protostones ?? [];
    const userIsInput = tx.inputs.some((i) => i.address === address);

    // Per-destination-output alkane amounts, from edict amounts where known.
    const outAmounts = new Map<number, Record<string, number>>();
    const needOutpoint = new Set<number>();
    const add = (out: number, id: string, amt: number) => {
      const m = outAmounts.get(out) ?? {};
      m[id] = (m[id] ?? 0) + amt;
      outAmounts.set(out, m);
    };
    for (const p of protostones) {
      for (const e of p.edicts ?? []) {
        if (e.amount > 0) add(e.output, `${e.id.block}:${e.id.tx}`, e.amount);
        else needOutpoint.add(e.output); // "transfer all"
      }
      if (typeof p.pointer === "number" && !outAmounts.has(p.pointer)) {
        needOutpoint.add(p.pointer);
      }
    }
    // Resolve unknown (transfer-all / pointer) destinations from their outpoint.
    await Promise.all(
      [...needOutpoint].map(async (out) => {
        const net = await this.outpointAlkanes(`${tx.txid}:${out}`);
        if (net) for (const [id, amt] of Object.entries(net)) add(out, id, amt);
      })
    );
    if (!outAmounts.size) return undefined;

    // Bucket destination alkanes by owner.
    const selfTotals: Record<string, number> = {};
    const sendTotals: Record<string, number> = {};
    let userDests = 0;
    let recipient: string | undefined;
    for (const [out, amounts] of outAmounts) {
      const owner = tx.outputs[out]?.address;
      const isSelf = owner === address;
      if (isSelf) userDests++;
      else if (owner) recipient = recipient ?? owner;
      const bucket = isSelf ? selfTotals : sendTotals;
      for (const [id, amt] of Object.entries(amounts)) {
        bucket[id] = (bucket[id] ?? 0) + amt;
      }
    }

    const legsFrom = (totals: Record<string, number>, sign: 1 | -1) =>
      Object.entries(totals)
        .filter(([, amt]) => amt !== 0)
        .map(([id, amt]) => ({ assetId: id, delta: String(sign * amt) }));

    if (userIsInput && Object.keys(sendTotals).length) {
      return { kind: "send", legs: legsFrom(sendTotals, -1), peer: recipient };
    }
    if (!userIsInput && Object.keys(selfTotals).length) {
      const peer = tx.inputs.map((i) => i.address).find((a) => a && a !== address);
      return { kind: "receive", legs: legsFrom(selfTotals, 1), peer: peer ?? undefined };
    }
    if (userIsInput && userDests >= 2 && Object.keys(selfTotals).length) {
      // Self-transfer spread across 2+ of the user's own outputs.
      return { kind: "split", legs: legsFrom(selfTotals, 1) };
    }
    return undefined;
  }

  async getAccountStats(address: string): Promise<IAccountStats | undefined> {
    // undefined signals a failed lookup (e.g. an address queried against the
    // wrong network mid-switch); callers keep the prior/loading state instead
    // of showing a spurious 0 balance. An empty (but valid) address returns [].
    const outpoints = await this.spendableOutpoints(address, false);
    if (!outpoints) return undefined;
    const balance = outpoints.reduce((acc, o) => acc + o.value, 0);
    return { balance, amount: 0, count: outpoints.length };
  }

  async getTransaction(txid: string) {
    // espo has no arbitrary-txid lookup; resolve from the current account's
    // history (the only context in which the UI requests a single tx).
    const address = storageService.currentAccount?.address;
    if (!address) return undefined;
    const txs = await this.fetchTransactions(address, 1);
    return txs?.find((t) => t.txid === txid);
  }

  /**
   * The raw espo enriched transaction for a txid (inputs/outputs with real
   * addresses + sat values, and the decoded runestone protostones). espo has no
   * arbitrary-txid lookup, so this resolves from the current account's history
   * (page 1, mempool-inclusive) — the only context the tx overview needs it for.
   */
  async getEnrichedTx(txid: string): Promise<EspoEnrichedTx | undefined> {
    const address = storageService.currentAccount?.address;
    if (!address) return undefined;
    const res = await this.callAddressTxs(address, 1, TX_PAGE_LIMIT);
    if (!res?.ok || !Array.isArray(res.transactions)) return undefined;
    return res.transactions.find((t) => t.txid === txid);
  }

  /**
   * The alkane trace outcome for a confirmed tx via get_alkane_tx_summary. Walks
   * every trace's flattened events; the LAST `return` event's status decides it —
   * espo serializes the status lowercase ("success" | "failure"), so a "failure"
   * (or any non-success) return is a revert. No traces / no return event → "none"
   * (the overview then shows no status line for a plain data tx).
   */
  async getTxTraceStatus(
    txid: string
  ): Promise<"success" | "reverted" | "pending" | "none"> {
    try {
      const res = await this.call<EspoTxSummary>(
        "essentials.get_alkane_tx_summary",
        { txid }
      );
      if (!res?.ok || !Array.isArray(res.traces)) return "none";
      const events = res.traces.flatMap(
        (tr) => tr.events ?? tr.trace?.events ?? []
      );
      let last: string | undefined;
      for (const e of events) {
        if ((e.event ?? "").toLowerCase() !== "return") continue;
        const status = e.data?.status;
        if (typeof status === "string") last = status.toLowerCase();
      }
      if (last === undefined) return "none";
      return last === "success" ? "success" : "reverted";
    } catch {
      return "none";
    }
  }

  async getTransactionHex(txid: string) {
    // The raw parent-tx hex needed for a P2PKH nonWitnessUtxo is bundled with
    // the wallet's own spendable outpoints (raw_tx_hex).
    const address = storageService.currentAccount?.address;
    if (!address) return undefined;
    try {
      const res = await this.call<EspoSpendableOutpointsResult>(
        "essentials.get_address_spendable_outpoints",
        { address, omit_raw_tx: false }
      );
      if (!res?.ok || !Array.isArray(res.outpoints)) return undefined;
      const match = res.outpoints.find(
        (o) => o.outpoint.split(":")[0] === txid
      );
      if (match && match.raw_tx_hex && match.raw_tx_hex !== "0") {
        return match.raw_tx_hex;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  async getUtxoValues(outpoints: string[]) {
    // espo serves no arbitrary-outpoint value lookup, but a PSBT the user is
    // signing spends their own unspent outpoints, which are exactly what
    // get_address_spendable_outpoints returns.
    const address = storageService.currentAccount?.address;
    if (!address) return undefined;
    const own = await this.spendableOutpoints(address, false);
    if (!own) return undefined;
    const byOutpoint = new Map(own.map((o) => [o.outpoint, o.value]));
    const values = outpoints.map((o) => byOutpoint.get(o));
    if (values.some((v) => v === undefined)) return undefined;
    return values as number[];
  }
}

export default new ApiController();
