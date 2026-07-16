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
  /** Per-network esplora (electrs) base URL overrides */
  esploraUrl?: Partial<Record<NetworkSlug, string>>;
}
