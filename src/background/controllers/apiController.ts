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
  ITransaction,
  Vin,
  Vout,
} from "@/shared/interfaces/api";
import { espoRpc, EspoRpcError } from "@/shared/utils";
import { storageService } from "../services";
import { DEFAULT_FEES } from "@/shared/constant";
import { networkInfo, networkSlug } from "@/shared/networks";

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
  getUtxoValues(outpoints: string[]): Promise<number[] | undefined>;
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
}

/** Number of transactions fetched per history page. */
const TX_PAGE_LIMIT = 50;
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
interface EspoTxInput {
  txid: string;
  vout: number;
  amount?: number;
  address?: string;
  isCoinbase?: boolean;
}

/** One output of an enriched espo transaction. */
interface EspoTxOutput {
  amount: number;
  scriptPubKey: string;
  address?: string;
  scriptPubKeyType?: string;
}

/** A protorune edict: transfer `amount` of alkane `id` to output vout `output`. */
interface EspoEdict {
  id: { block: number; tx: number };
  amount: number;
  output: number;
}

interface EspoProtostone {
  edicts?: EspoEdict[];
  pointer?: number | null;
  message?: string;
}

/** An enriched transaction as returned by essentials.get_address_transactions. */
interface EspoEnrichedTx {
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
interface EspoTraceEvent {
  event?: string;
  data?: {
    context?: {
      /** The alkane contract this frame invoked. */
      myself?: { block?: string; tx?: string };
      /** Call inputs; inputs[0] is the opcode (hex string). */
      inputs?: string[];
    };
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
  if (!legs.length) return undefined;
  // frBTC wrap (BTC -> frBTC, net +frBTC) / unwrap (frBTC -> BTC, net -frBTC),
  // identified from the trace regardless of the net leg count.
  if (summary.frbtc) return { kind: summary.frbtc, legs };
  // A trace-confirmed AMM swap.
  if (summary.isSwap) return { kind: "buy", legs };
  const hasIn = legs.some((l) => !l.delta.startsWith("-"));
  const hasOut = legs.some((l) => l.delta.startsWith("-"));
  // Mixed signs with no swap opcode = a multi-asset contract call (LP/mint/
  // router), not a swap: leave it "other".
  if (hasIn && hasOut) return undefined;
  return { kind: hasIn ? "receive" : "send", legs };
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

  // A protostone tx we couldn't decode into alkane legs (a pointer-only
  // transfer whose amount isn't recoverable, or another alkane op) is an alkane
  // interaction, NOT a BTC transfer — the dust/fee BTC delta is incidental.
  // Only plain (non-protostone) txs are BTC sends/receives.
  if (protostones.length) return { ...base, kind: "other", legs: [] };

  // Plain BTC movement.
  const outToSelf = tx.outputs
    .filter((o) => o.address === address)
    .reduce((a, o) => a + (o.amount ?? 0), 0);
  const inFromSelf = tx.inputs
    .filter((i) => i.address === address)
    .reduce((a, i) => a + (i.amount ?? 0), 0);
  const delta = outToSelf - inFromSelf; // + received, - sent (incl. fee)

  if (delta === 0) return { ...base, kind: "other", legs: [] };

  const isReceive = delta > 0;
  const peer = isReceive
    ? tx.inputs.map((i) => i.address).find((a) => a && a !== address)
    : tx.outputs.map((o) => o.address).find((a) => a && a !== address);
  return {
    ...base,
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

  private async fetchTransactions(
    address: string,
    page: number
  ): Promise<ITransaction[] | undefined> {
    try {
      const res = await this.call<EspoAddressTransactionsResult>(
        "essentials.get_address_transactions",
        {
          address,
          page,
          limit: TX_PAGE_LIMIT,
          only_alkane_txs: false,
        }
      );
      if (!res?.ok || !Array.isArray(res.transactions)) return;
      return res.transactions.map(mapEspoTx);
    } catch {
      return;
    }
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
      this.call<EspoAddressTransactionsResult>(
        "essentials.get_address_transactions",
        { address, page, limit, only_alkane_txs: false }
      ).catch(() => undefined),
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
    const needSummary: IActivityEntry[] = [];
    const needTransfer: { entry: IActivityEntry; tx: EspoEnrichedTx }[] = [];
    for (const tx of rawTxs.transactions) {
      if (seen.has(tx.txid)) continue;
      const entry = mapRawTxActivity(tx, address);
      entries.push(entry);
      const protostones = tx.runestone?.protostones ?? [];
      if (!protostones.length) continue;
      if (protostones.some((p) => p.message && p.message.length > 0)) {
        needSummary.push(entry);
      } else if (entry.kind === "other") {
        needTransfer.push({ entry, tx });
      }
    }

    await Promise.all([
      ...needSummary.map(async (entry) => {
        const summary = await this.alkaneTxSummary(entry.txid);
        const inferred = summary && activityFromOutflow(summary);
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
   * BTC and frBTC (32:0) are special: frBTC's own `-usd` pool is illiquid and
   * goes stale, and espo does NOT expose its indexed BTC/USD line as a candle
   * pool. Since espo defines `token_usd = token_sats * btc_usd_line`, the real
   * BTC/USD history is recovered as `usd / sats` of a liquid token (DIESEL);
   * frBTC is pegged 1:1 to BTC so it uses that same series.
   *
   * Returned oldest-first for charting.
   */
  async getCandles(
    assetId: string,
    timeframe: string,
    limit: number
  ): Promise<ICandle[] | undefined> {
    if (assetId === "btc" || assetId === "32:0") {
      return this.btcIndexCandles(timeframe, limit);
    }
    const direct = assetId === "2:0" || assetId === "2:77623";
    const pool = direct ? `${assetId}-usd` : `${assetId}-derived_2:0-usd`;
    const rows = await this.poolCandles(pool, timeframe, limit);
    if (!rows) return undefined;
    return rows
      .map((r) => ({ ts: r.ts, price: r.val }))
      .sort((a, b) => a.ts - b.ts);
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

  /**
   * Espo's indexed BTC/USD history, reconstructed as `usd / sats * 1e8` from
   * DIESEL's liquid candle series (both scaled by 10^16, so the scale cancels).
   */
  private async btcIndexCandles(
    timeframe: string,
    limit: number
  ): Promise<ICandle[] | undefined> {
    const [usd, sats] = await Promise.all([
      this.poolCandles("2:0-usd", timeframe, limit),
      this.poolCandles("2:0-sats", timeframe, limit),
    ]);
    if (!usd || !sats) return undefined;
    const satsByTs = new Map(sats.map((c) => [c.ts, c.val]));
    const out: ICandle[] = [];
    for (const c of usd) {
      const s = satsByTs.get(c.ts);
      if (s && s > 0) out.push({ ts: c.ts, price: (c.val / s) * 1e8 });
    }
    return out.sort((a, b) => a.ts - b.ts);
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
      if (!Object.keys(net).length) return undefined;
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
      return { net, hasCreate, frbtc, isSwap };
    } catch {
      return undefined;
    }
  }

  /** Alkane balances {id: amount} sitting at an outpoint (empty once spent). */
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
