import { Network, networks } from "bitcoinjs-lib";

export type NetworkSlug = "mainnet" | "regtest";

export interface INetworkInfo {
  slug: NetworkSlug;
  name: string;
  network: Network;
  /** Roundel accent color, matching espo's explorer network icons */
  color: string;
  /** espo JSON-RPC 2.0 endpoint (POST base) for this network */
  rpcUrl: string;
  /**
   * metashrew/kirby JSON-RPC endpoint: contract views and simulation. The
   * alkanesjs Provider needs it alongside espo (espo = index/utxos/broadcast).
   */
  metashrewUrl: string;
  /** espo block-explorer base (tx links point at `{explorerUrl}/tx/{txid}`) */
  explorerUrl: string;
  /** Whether fiat price data is available for this network */
  hasPrice: boolean;
  /**
   * The Oyl AMM factory/router alkane id ("block:tx") swaps are routed through.
   * Mainnet is 4:65522 (matches espo's own `get_amm_contract`); a regtest
   * deployment assigns its own ids, so it is overridable per network.
   */
  ammFactoryId: string;
  /** The frBTC synth alkane id ("block:tx") wraps and unwraps go through. */
  frbtcId: string;
}

/** An alkane id parsed from "block:tx". */
export function parseAlkaneId(id: string): { block: bigint; tx: bigint } {
  const [block, tx] = id.split(":");
  return { block: BigInt(block), tx: BigInt(tx) };
}

export const NETWORKS: INetworkInfo[] = [
  {
    slug: "mainnet",
    name: "Mainnet",
    network: networks.bitcoin,
    color: "#f7931a",
    rpcUrl: process.env.API_URL ?? "https://api.alkanode.com/rpc",
    metashrewUrl:
      process.env.METASHREW_URL ?? "https://kirby.alkanode.com/rpc",
    explorerUrl: process.env.EXPLORER_URL ?? "https://espo.sh",
    hasPrice: true,
    ammFactoryId: process.env.AMM_FACTORY_ID ?? "4:65522",
    frbtcId: process.env.FRBTC_ID ?? "32:0",
  },
  {
    slug: "regtest",
    name: "Regtest",
    network: networks.regtest,
    color: "#5fd15c",
    rpcUrl: process.env.REGTEST_API_URL ?? "https://regtest.espo.sh/rpc",
    metashrewUrl:
      process.env.REGTEST_METASHREW_URL ??
      "https://kirby-regtest.alkanode.com/rpc",
    explorerUrl: process.env.REGTEST_EXPLORER_URL ?? "https://regtest.espo.sh",
    // regtest has no ammdata price module, so no USD valuation
    hasPrice: false,
    ammFactoryId: process.env.REGTEST_AMM_FACTORY_ID ?? "4:65522",
    frbtcId: process.env.REGTEST_FRBTC_ID ?? "32:0",
  },
];

export function isRegtest(network: Network): boolean {
  return network.bech32 === networks.regtest.bech32;
}

export function networkSlug(network: Network): NetworkSlug {
  return isRegtest(network) ? "regtest" : "mainnet";
}

export function networkInfo(network: Network): INetworkInfo {
  return NETWORKS.find((f) => f.slug === networkSlug(network)) ?? NETWORKS[0];
}

export function networkFromSlug(slug: NetworkSlug): Network {
  return (NETWORKS.find((f) => f.slug === slug) ?? NETWORKS[0]).network;
}

/**
 * Block explorer link for a transaction (`{explorer}/tx/{txid}`). `override` is
 * the user's per-network explorer URL from settings; falls back to the default.
 */
export function explorerTxUrl(
  network: Network,
  txid: string,
  override?: string
): string {
  const base = (override?.trim() || networkInfo(network).explorerUrl).replace(
    /\/+$/,
    ""
  );
  return `${base}/tx/${txid}`;
}

export function explorerAddressUrl(
  network: Network,
  address: string,
  override?: string
): string {
  const base = (override?.trim() || networkInfo(network).explorerUrl).replace(
    /\/+$/,
    ""
  );
  return `${base}/address/${address}`;
}

export function explorerAlkaneUrl(
  network: Network,
  id: string,
  override?: string
): string {
  const base = (override?.trim() || networkInfo(network).explorerUrl).replace(
    /\/+$/,
    ""
  );
  return `${base}/alkane/${id}`;
}
