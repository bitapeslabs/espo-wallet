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
  /** espo block-explorer base (tx links point at `{explorerUrl}/tx/{txid}`) */
  explorerUrl: string;
  /** Whether fiat price data is available for this network */
  hasPrice: boolean;
}

export const NETWORKS: INetworkInfo[] = [
  {
    slug: "mainnet",
    name: "Mainnet",
    network: networks.bitcoin,
    color: "#f7931a",
    rpcUrl: process.env.API_URL ?? "https://api.alkanode.com/rpc",
    explorerUrl: process.env.EXPLORER_URL ?? "https://espo.sh",
    hasPrice: true,
  },
  {
    slug: "regtest",
    name: "Regtest",
    network: networks.regtest,
    color: "#5fd15c",
    rpcUrl: process.env.REGTEST_API_URL ?? "https://regtest.espo.sh/rpc",
    explorerUrl: process.env.REGTEST_EXPLORER_URL ?? "https://regtest.espo.sh",
    // regtest has no ammdata price module, so no USD valuation
    hasPrice: false,
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
