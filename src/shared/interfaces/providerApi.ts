import type {
  SendBTC,
  SignPsbtOptions,
} from "@/background/services/keyring/types";

export type NetworkType = "mainnet" | "regtest";

export interface CreateTxPayload {
  to: string;
  amount: number;
  feeRate: number;
  receiverToPayFee: boolean;
}

/**
 * The dApp-facing provider injected as window.espo. Method semantics mirror
 * the background providerController one to one.
 */
export interface IEspoProvider {
  connect(): Promise<string>;
  getBalance(): Promise<number>;
  getAccountName(): Promise<string>;
  isConnected(): Promise<boolean>;
  getAccount(): Promise<string>;
  getPublicKey(): Promise<string>;
  createTx(data: CreateTxPayload): Promise<string>;
  signMessage(text: string): Promise<string>;
  calculateFee(psbtBase64: string, feeRate: number): Promise<number>;
  signPsbt(psbtBase64: string, options?: SignPsbtOptions): Promise<string>;
  multiPsbtSign(
    data: { psbtBase64: string; options?: SignPsbtOptions }[]
  ): Promise<string[]>;
  getVersion(): Promise<string>;
  switchNetwork(network: NetworkType): Promise<NetworkType>;
  getNetwork(): Promise<NetworkType>;
  on(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
}

export type { SendBTC, SignPsbtOptions };
