import { Network } from "bitcoinjs-lib";
import type { ConnectedSite } from "../permission";
import type { IWallet } from "@/shared/interfaces";
import type { NetworkSlug } from "@/shared/networks";

interface StorageAccountItem {
  id: number;
  name: string;
}

interface StorageWalletItem extends Omit<IWallet, "accounts" | "id"> {
  accounts: StorageAccountItem[];
}

export type DecryptedSecrets = { id: number; data: any; phrase?: string }[];

export interface StorageInterface {
  enc?: Record<"data" | "iv" | "salt", string>;
  cache: {
    /** Marker distinguishing Espo Wallet storage from legacy Bells data */
    espo?: boolean;
    wallets: StorageWalletItem[];
    addressBook: string[];
    selectedWallet?: number;
    selectedAccount?: number;
    pendingWallet?: string;
    connectedSites: ConnectedSite[];
    language?: string;
    unpushedHexes?: string[];
    network?: Network;
    esploraUrl?: Partial<Record<NetworkSlug, string>>;
  };
}
