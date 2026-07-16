import { Network, networks } from "bitcoinjs-lib";

export type NetworkSlug = "mainnet" | "regtest";

export interface INetworkInfo {
  slug: NetworkSlug;
  name: string;
  network: Network;
  /** Roundel accent color, matching espo's explorer network icons */
  color: string;
  esploraUrl: string;
  /** Whether fiat price data is available for this network */
  hasPrice: boolean;
}

export const NETWORKS: INetworkInfo[] = [
  {
    slug: "mainnet",
    name: "Bitcoin Mainnet",
    network: networks.bitcoin,
    color: "#f7931a",
    esploraUrl: process.env.API_URL ?? "https://mempool.space/api",
    hasPrice: true,
  },
  {
    slug: "regtest",
    name: "Regtest",
    network: networks.regtest,
    color: "#5fd15c",
    esploraUrl: process.env.REGTEST_API_URL ?? "http://localhost:3002",
    // regtest coins are valued at the real BTC price
    hasPrice: true,
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
 * Block explorer link for a transaction. Mainnet uses mempool.space;
 * regtest has no public explorer, so callers should hide the link.
 */
export function explorerTxUrl(
  network: Network,
  txid: string
): string | undefined {
  if (isRegtest(network)) return undefined;
  return `https://mempool.space/tx/${txid}`;
}
