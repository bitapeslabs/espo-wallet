import { Network, Psbt } from "bitcoinjs-lib";
import { keyringService } from "../services";
import type { Hex, SendBTC } from "../services/keyring/types";
import type { IPrivateWallet } from "@/shared/interfaces";
import type { AddressType } from "../services/keyring/hdw";

export interface IKeyringController {
  init(password: string): Promise<IPrivateWallet[]>;
  newKeyring(
    type: "simple" | "root",
    payload: string,
    network: Network,
    hdPath?: string
  ): Promise<string | undefined>;
  exportAccount(address: Hex): Promise<string>;
  signTransaction(txHex: string): Promise<string>;
  signMessage(msgParams: { from: string; data: string }): Promise<string>;
  signPersonalMessage(msgParams: {
    from: string;
    data: string;
  }): Promise<string>;
  sendBTC(data: SendBTC): Promise<string>;
  changeAddressType(
    walletIndex: number,
    addressType: AddressType
  ): Promise<string[]>;
  exportPublicKey(address: string): Promise<string>;
  serializeKeyringById(index: number): Promise<any>;
  signPsbtBase64(psbtBase64: string): Promise<string>;
  sendTransfer(params: {
    assetId: string;
    toAddress: string;
    rawAmount: string;
    feeRate: number;
  }): Promise<{ rawtx: string; fee: number }>;
  buildSwapPackage(params: {
    fromId: string;
    toId: string;
    rawAmountIn: string;
    minAmountOut: string;
    feeRate: number;
    mode?: "exactIn" | "exactOut";
    deadlineBlocks?: number;
    path?: string[];
  }): Promise<{
    txs: { hex: string; txid: string; label: string; vsize: number; fee: number }[];
    packageFeeRate?: number;
  }>;
}

class KeyringController implements IKeyringController {
  /**
   * Method should be called after user typed a password
   * @param {string} password Password that used on creating account
   * @returns {Promise<IPrivateWallet[]>} List of imported accounts that was initialized
   */
  async init(password: string): Promise<IPrivateWallet[]> {
    return await keyringService.init(password);
  }

  /**
   * Method should be called to create a new wallet from mnemonic
   * @param {"simple" | "root"} type Type of wallet that should be created
   * @param {string} payload Phrases string words separated by space that generated for wallet or private key hex format
   * @returns {Promise<string | undefined>} Address of created wallet
   */
  async newKeyring(
    walletType: "simple" | "root",
    payload: string,
    network: Network,
    hdPath?: string
  ): Promise<string | undefined> {
    return keyringService.newKeyring({ walletType, payload, hdPath, network });
  }

  /**
   * Method exports private key of selected account
   * @param {Hex} address Address of account
   * @returns {Promise<string>} WIF representation of private key
   */
  async exportAccount(address: Hex): Promise<string> {
    return keyringService.exportAccount(address);
  }

  /**
   * Method should be used to sign a new transaction before broadcasting it
   * @param {string} txHex Psbt builded transaction with inputs that should be signed and hexed
   * @returns {Promise<string>} Method mutate input transaction and with that returns nothing
   */
  async signTransaction(txHex: string): Promise<string> {
    const psbt = Psbt.fromHex(txHex);
    keyringService.signPsbt(psbt);
    return psbt.toHex();
  }

  async signPsbtBase64(
    psbtBase64: string,
    disableTweakSigner?: boolean
  ): Promise<string> {
    const psbt = Psbt.fromBase64(psbtBase64);
    keyringService.signPsbt(psbt, disableTweakSigner);
    return psbt.toBase64();
  }

  async signMessage(msgParams: { from: string; data: string }) {
    return keyringService.signMessage(msgParams);
  }

  async signPersonalMessage(msgParams: { from: string; data: string }) {
    return keyringService.signPersonalMessage(msgParams);
  }

  /**
   * Method should be used to create hex of transaction and sign all inputs
   * @param {SendBTC} data Input data for the transaction
   * @returns {Promise<string>} Hex of transaction to push transaction to the blockchain with
   */
  async sendBTC(data: SendBTC): Promise<string> {
    return await keyringService.sendBTC(data);
  }

  async sendTransfer(params: {
    assetId: string;
    toAddress: string;
    rawAmount: string;
    feeRate: number;
  }): Promise<{ rawtx: string; fee: number }> {
    return keyringService.sendTransfer(params);
  }

  async buildSwapPackage(params: {
    fromId: string;
    toId: string;
    rawAmountIn: string;
    minAmountOut: string;
    feeRate: number;
    mode?: "exactIn" | "exactOut";
    deadlineBlocks?: number;
    path?: string[];
  }) {
    return keyringService.buildSwapPackage(params);
  }

  async exportPublicKey(address: string): Promise<string> {
    return keyringService.exportPublicKey(address);
  }

  async changeAddressType(
    walletIndex: number,
    addressType: AddressType
  ): Promise<string[]> {
    return keyringService.changeAddressType(walletIndex, addressType);
  }

  async serializeKeyringById(index: number) {
    return keyringService.serializeById(index);
  }
}

export default new KeyringController();
