import type { Network, Psbt } from "bitcoinjs-lib";

export type Base58String = string;

export interface PrivateKeyOptions {
  seed: string;
  hdPath?: string;
}

export interface FromSeedOpts {
  seed: Uint8Array;
  hideRoot?: boolean;
  addressType?: AddressType;
  hdPath?: string;
  network?: Network;
}

export interface FromMnemonicOpts {
  mnemonic: string;
  passphrase?: string;
  hideRoot?: boolean;
  addressType?: AddressType;
  hdPath?: string;
}

interface SerializedBase {
  addressType: AddressType;
  network?: Network;
}

export interface SerializedHDKey extends SerializedBase {
  seed: string;
  numberOfAccounts?: number;
  hideRoot?: boolean;
  hdPath?: string;
}

export interface SerializedSimpleKey extends SerializedBase {
  privateKey: string;
  isHex?: boolean;
}

export type Hex = string;

export interface ToSignInput {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
  disableTweakSigner?: boolean;
}

export enum AddressType {
  P2PKH = 0,
  P2WPKH = 1,
  P2TR = 2,
  P2SH_P2WPKH = 3,
  M44_P2WPKH = 4,
  M44_P2TR = 5,
}

export type Keyring<State> = {
  addressType?: AddressType;
  hideRoot?: boolean;
  getAccounts(): Hex[];
  toggleHideRoot?(): void;
  addAccounts?(number: number): string[];
  serialize(): State;
  deserialize(state: State): Keyring<State>;
  exportAccount(address: Hex, options?: Record<string, unknown>): string;
  exportPublicKey(address: Hex): string;
  verifyMessage(address: Hex, text: string, sig: string): boolean;
  signPsbt(psbt: Psbt, inputs: ToSignInput[]): void;
  signMessage(address: Hex, message: Hex): string;
  signPersonalMessage(address: Hex, message: Hex): string;
  signTypedData(address: Hex, typedData: Record<string, unknown>): string;
  signAllInputsInPsbt(
    psbt: Psbt,
    accountAddress: string,
    disableTweakSigner?: boolean
  ): { signatures: (string | undefined)[] };
  signInputsWithoutFinalizing(
    psbt: Psbt,
    inputs: ToSignInput[]
  ): {
    inputIndex: number;
    partialSig: { pubkey: Buffer; signature: Buffer }[];
  }[];
  setNetwork(network: Network): void;
};
