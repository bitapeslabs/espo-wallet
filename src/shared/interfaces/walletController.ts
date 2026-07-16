import type { IAccount } from "./accounts";
import type {
  DeleteWalletResult,
  INewWalletProps,
  IPrivateWallet,
  IWallet,
  SaveWalletsPayload,
} from "./wallets";
import { Network } from "bitcoinjs-lib";

export interface IWalletController {
  createNewWallet(props: INewWalletProps): Promise<IWallet>;
  saveWallets(payload?: SaveWalletsPayload): Promise<void>;
  isVaultEmpty(): Promise<boolean>;
  wipeWallet(): Promise<void>;
  importWallets(password: string): Promise<Omit<IPrivateWallet, "data">[]>;
  loadAccountsData(walletId: number, accounts: IAccount[]): Promise<IAccount[]>;
  createNewAccount(name?: string): Promise<IAccount | undefined>;
  generateMnemonicPhrase(): Promise<string>;
  deleteWallet(id: number): Promise<DeleteWalletResult>;
  toggleRootAccount(): Promise<string[]>;
  switchNetwork(network: Network): Promise<void>;
}
