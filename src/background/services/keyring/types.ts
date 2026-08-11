import { Network } from "bitcoinjs-lib";

export type Json = any;
export type Hex = string;

export type Eip1024EncryptedData = {
  version: string;
  nonce: string;
  ephemPublicKey: string;
  ciphertext: string;
};

/**
 * A plain BTC send (the dapp `createTx` path). UTXO selection happens inside
 * the alkanesjs builder now, so no utxo list travels with it.
 */
export interface SendBTC {
  to: string;
  amount: number;
  receiverToPayFee: boolean;
  feeRate: number;
  network: Network;
}

interface BaseUserToSignInput {
  index: number;
  sighashTypes: number[] | undefined;
  disableTweakSigner?: boolean;
}

export interface AddressUserToSignInput extends BaseUserToSignInput {
  address: string;
}

export interface PublicKeyUserToSignInput extends BaseUserToSignInput {
  publicKey: string;
}

export type UserToSignInput = AddressUserToSignInput | PublicKeyUserToSignInput;

export interface SignPsbtOptions {
  autoFinalized: boolean;
  toSignInputs?: UserToSignInput[];
}

export interface ToSignInput {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}
