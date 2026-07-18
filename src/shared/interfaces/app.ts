import { Network } from "bitcoinjs-lib";
import type { NetworkSlug } from "../networks";

export interface IAppStateBase {
  isReady: boolean;
  isUnlocked: boolean;
  password?: string;
  addressBook: string[];
  pendingWallet?: string;
  language: string;
  network: Network;
  /** Per-network espo JSON-RPC endpoint overrides */
  rpcUrl?: Partial<Record<NetworkSlug, string>>;
  /** Per-network block-explorer base URL overrides */
  explorerUrl?: Partial<Record<NetworkSlug, string>>;
}
