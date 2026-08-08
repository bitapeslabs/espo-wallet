export interface ApiUTXO {
  txid: string;
  vout: number;
  status: Status;
  value: number;
  hex?: string;
}

export interface Status {
  confirmed: boolean;
  block_height: number;
  block_hash: string;
  block_time: number;
}

export interface ITransaction {
  txid: string;
  version: number;
  locktime: number;
  vin: Vin[];
  vout: Vout[];
  size: number;
  weight: number;
  sigops: number;
  fee: number;
  status: Status;
}

export interface Vin {
  txid: string;
  vout: number;
  prevout?: Prevout;
  scriptsig: string;
  scriptsig_asm: string;
  witness?: string[];
  is_coinbase: boolean;
  sequence: number;
  inner_redeemscript_asm?: string;
}

export interface Prevout {
  scriptpubkey: string;
  scriptpubkey_asm: string;
  scriptpubkey_type: string;
  scriptpubkey_address: string;
  value: number;
}

export interface Vout {
  scriptpubkey: string;
  scriptpubkey_asm: string;
  scriptpubkey_type: string;
  scriptpubkey_address: string;
  value: number;
}

export interface Status {
  confirmed: boolean;
  block_height: number;
  block_hash: string;
  block_time: number;
}

export interface ITransactionInfo {
  _id: string;
  txid: string;
  network: string;
  chain: string;
  blockHeight: number;
  blockHash: string;
  blockTime: string;
  blockTimeNormalized: string;
  coinbase: boolean;
  locktime: number;
  inputCount: number;
  outputCount: number;
  size: number;
  fee: number;
  value: number;
  confirmations: number;
}

export interface ISend {
  toAddress: string;
  fromAddress: string;
  amount: number;
  feeAmount: number;
  includeFeeInAmount: boolean;
  hex: string;
}

export interface IAccountStats {
  balance: number;
  amount: number;
  count: number;
}

/** A single holding from ammdata.get_portfolio_stats (BTC or an alkane). */
export interface IPortfolioAsset {
  /** "btc" for bitcoin, "block:tx" for an alkane */
  id: string;
  name: string;
  symbol: string;
  /** Raw integer balance as a string; every asset uses 8 decimals. */
  balance: string;
  priceUsd: number | null;
  valueUsd: number | null;
  /** 24h price change, percent. */
  change24h: number | null;
  /** 24h change in this holding's USD value (signed). */
  valueChangeUsd24h: number | null;
}

/** One price point of a token's chart (ammdata.get_candles close, in USD). */
export interface ICandle {
  /** Candle open time, unix seconds. */
  ts: number;
  /** Close price in USD. */
  price: number;
}

/** A token row for the search/trending list (price, market cap, 24h change). */
export interface ITokenSummary {
  /** Alkane id "block:tx". */
  id: string;
  name: string;
  symbol: string;
  /** Latest USD price, or null when unavailable. */
  priceUsd: number | null;
  /** 24h price change, percent. */
  change24h: number | null;
  /** Market cap in USD. */
  marketCapUsd: number | null;
  /** Cumulative trading volume (USD), used to rank trending tokens. */
  volumeUsd: number | null;
}

/** On-chain deploy + holder metadata from essentials.get_alkane_info. */
export interface IAlkaneMeta {
  /** Block height the alkane was created at. */
  creationHeight: number;
  /** Deploy block time, unix seconds. */
  creationTimestamp: number;
  /** Deploy transaction id. */
  creationTxid: string;
  /** Number of holding addresses. */
  holderCount: number;
}

/** Semantic activity kinds from espo (`tokendata`) plus BTC movements. */
export type ActivityKind =
  | "buy"
  | "sell"
  | "liquidity_add"
  | "liquidity_remove"
  | "pool_create"
  | "mint"
  | "send"
  | "receive"
  | "split"
  | "wrap"
  | "unwrap"
  | "other";

/** One amount line of an activity entry (an asset moving in or out). */
export interface IActivityLeg {
  /** Alkane id "block:tx", or "btc" for bitcoin. */
  assetId: string;
  /** Raw signed integer string, 8 decimals; the sign is the direction. */
  delta: string;
}

/** A single unified activity-feed entry. */
export interface IActivityEntry {
  txid: string;
  kind: ActivityKind;
  /** Unix seconds; 0 when unknown (mempool). */
  timestamp: number;
  confirmed: boolean;
  /** False for a reverted alkane call. */
  success: boolean;
  /** 1-2 asset legs (e.g. swap = token + counter). */
  legs: IActivityLeg[];
  /** Counterparty address for BTC send/receive. */
  peer?: string;
}

/** Lifecycle of a subfrost unwrap request (frBTC -> BTC). */
export type UnwrapState = "unconfirmed" | "confirmed" | "fulfilled";

/** One row of subfrost.get_unwrap_requests_by_address (or a mempool unwrap). */
export interface IUnwrapRequest {
  /** Txid of the unwrap transaction itself. */
  txid: string;
  /** The signer-anchor vout inside that tx. */
  vout: number;
  /** Unix seconds; 0 when unknown (mempool). */
  timestamp: number;
  /** Raw 8-decimal frBTC base units burned (1:1 with sats). */
  amount: string;
  state: UnwrapState;
  /** The signer's BTC payout tx, once the request is fulfilled. */
  fulfillmentTxid?: string;
}

/** Parsed ammdata.get_portfolio_stats result for one address. */
export interface IPortfolio {
  address: string;
  totalValueUsd: number;
  /** 24h portfolio change, percent. */
  change24h: number | null;
  /** 24h change in total portfolio USD value (signed). */
  changeUsd24h: number | null;
  /** False when some held assets have no price yet. */
  complete: boolean;
  btc: IPortfolioAsset | null;
  alkanes: IPortfolioAsset[];
}
