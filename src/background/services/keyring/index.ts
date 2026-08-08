import { KeyringServiceError } from "./consts";
import type { Hex, Json, SendBTC, UserToSignInput } from "./types";
import { storageService } from "@/background/services";
import { espoProvider } from "@/background/services/espoProvider";
import { Network, payments, Psbt } from "bitcoinjs-lib";
import { toXOnly } from "@/shared/utils/transactions";
import { createSendBtc } from "./txBuilder";
import {
  SimpleKey,
  HDPrivateKey,
  AddressType,
  type Keyring,
} from "./hdw";
import HDSimpleKey from "./hdw/simple";
import { INewWalletProps } from "@/shared/interfaces";
import apiController from "@/background/controllers/apiController";
import { hdPathForAddressType } from "@/shared/constant";
import {
  getProtostoneUnsignedPsbtBase64,
  consumeOrThrow,
  buildSwapTransactions,
  type SingularTransfer,
  type SwapAssetRef,
} from "alkanesjs";
import { networkInfo, parseAlkaneId } from "@/shared/networks";

export const KEYRING_SDK_TYPES = {
  SimpleKey,
  HDPrivateKey,
};

class KeyringService {
  keyrings: Keyring<Json>[];

  constructor() {
    this.keyrings = [];
  }

  async init(password: string) {
    const { wallets, network } = await storageService.importWallets(password);
    for (const i of wallets) {
      if (typeof i.data === "undefined") continue;

      const params = {
        addressType:
          i.data.addressType === undefined ? i.data.addressType : i.addressType,
        network,
      };

      let wallet: HDPrivateKey | SimpleKey;
      if (i.data.seed) {
        wallet = HDPrivateKey.deserialize({
          ...i.data,
          hideRoot: i.hideRoot,
          ...params,
        });
      } else {
        wallet = HDSimpleKey.deserialize({
          ...i.data,
          ...params,
        }) as unknown as HDSimpleKey;
      }
      this.keyrings[i.id] = wallet;
    }

    return wallets;
  }

  async newKeyring({
    walletType,
    payload,
    addressType = AddressType.P2WPKH,
    hideRoot,
    restoreFrom,
    hdPath,
    passphrase,
    network,
  }: INewWalletProps) {
    let keyring: HDPrivateKey | HDSimpleKey;
    if (walletType === "root") {
      keyring = await HDPrivateKey.fromMnemonic({
        mnemonic: payload,
        hideRoot,
        addressType,
        // Fall back to the BIP path that matches the address type (BIP86 for
        // taproot, etc.) so an unspecified path never derives taproot on the
        // segwit path.
        hdPath: hdPath ?? hdPathForAddressType(addressType),
        passphrase,
      });
    } else {
      keyring = HDSimpleKey.deserialize({
        privateKey: payload,
        addressType,
        isHex: restoreFrom === "hex",
      });
    }
    keyring.addressType =
      typeof addressType === "number" ? addressType : AddressType.P2WPKH;
    keyring.setNetwork(network);
    this.keyrings.push(keyring);
    if (!keyring.getAccounts().length)
      return (keyring as HDPrivateKey).addAccounts(1)[0];
    return keyring.getAccounts()[0];
  }

  exportAccount(address: Hex) {
    if (storageService.currentWallet?.id === undefined)
      throw new Error("Internal error: Current wallet is not defined");
    const keyring = this.getKeyringByIndex(storageService.currentWallet.id);
    if (!keyring.exportAccount) {
      throw new Error(KeyringServiceError.UnsupportedExportAccount);
    }

    return keyring.exportAccount(address);
  }

  getAccounts(address: Hex) {
    for (const i of this.keyrings) {
      const accounts = i.getAccounts();
      if (accounts.includes(address)) {
        return accounts;
      }
    }
    throw new Error("Account not found");
  }

  getKeyringByIndex(index: number) {
    if (index + 1 > this.keyrings.length) {
      throw new Error("Invalid keyring index");
    }
    return this.keyrings[index];
  }

  serializeById(index: number): any {
    return this.keyrings[index].serialize();
  }

  signPsbt(psbt: Psbt, disableTweakSigner?: boolean) {
    if (storageService.currentWallet?.id === undefined)
      throw new Error("Internal error: Current wallet is not defined");
    if (storageService.currentAccount?.address === undefined)
      throw new Error("Internal error: Current account is not defined");
    const keyring = this.getKeyringByIndex(storageService.currentWallet.id);
    const publicKey = this.exportPublicKey(
      storageService.currentAccount.address
    );

    psbt.data.inputs.forEach((v) => {
      const isNotSigned = !(v.finalScriptSig || v.finalScriptWitness);
      const isP2TR =
        keyring.addressType === AddressType.P2TR ||
        keyring.addressType === AddressType.M44_P2TR;
      const lostInternalPubkey = !v.tapInternalKey;
      if (isNotSigned && isP2TR && lostInternalPubkey) {
        const tapInternalKey = toXOnly(
          Buffer.from(
            this.exportPublicKey(storageService.currentAccount!.address!),
            "hex"
          )
        );
        const { output } = payments.p2tr({
          internalPubkey: tapInternalKey,
          network: storageService.appState.network,
        });
        if (v.witnessUtxo?.script.toString("hex") == output?.toString("hex")) {
          v.tapInternalKey = tapInternalKey;
        }
      }
    });

    keyring.signPsbt(
      psbt,
      psbt.data.inputs.map((v, index) => ({
        index,
        publicKey,
        sighashTypes: v.sighashType ? [v.sighashType] : undefined,
        disableTweakSigner,
      }))
    );
  }

  signMessage(msgParams: { from: string; data: string }) {
    if (storageService.currentWallet?.id === undefined)
      throw new Error("Internal error: Current wallet is not defined");
    const keyring = this.getKeyringByIndex(storageService.currentWallet.id);
    return keyring.signMessage(msgParams.from, msgParams.data);
  }

  signPersonalMessage(msgParams: { from: string; data: string }) {
    if (storageService.currentWallet?.id === undefined)
      throw new Error("Internal error: Current wallet is not defined");
    const keyring = this.getKeyringByIndex(storageService.currentWallet.id);
    if (!keyring.signPersonalMessage) {
      throw new Error(KeyringServiceError.UnsupportedSignPersonalMessage);
    }

    return keyring.signPersonalMessage(msgParams.from, msgParams.data);
  }

  exportPublicKey(address: Hex) {
    if (storageService.currentWallet?.id === undefined)
      throw new Error("Internal error: Current wallet is not defined");
    const keyring = this.getKeyringByIndex(storageService.currentWallet.id);
    return keyring.exportPublicKey(address);
  }

  async sendBTC(data: SendBTC) {
    const account = storageService.currentAccount;
    const wallet = storageService.currentWallet;
    if (!account?.address || !wallet)
      throw new Error(
        "Error when trying to get the current account or current account address or wallet"
      );

    const publicKey = this.exportPublicKey(account.address);

    const psbt = await createSendBtc({
      utxos: data.utxos,
      toAddress: data.to,
      toAmount: data.amount,
      feeRate: data.feeRate,
      network: data.network,
      changeAddress: account.address,
      receiverToPayFee: data.receiverToPayFee,
      publicKey,
      addressType: wallet.addressType,
      signPsbt: (psbt) => this.signPsbt(psbt),
      getTxHex: (txid) => apiController.getTransactionHex(txid),
    });

    return psbt.toHex();
  }

  /**
   * Build + sign a transfer (BTC or an alkane) with alkanesjs — the wallet's
   * PSBT builder for both. It pulls UTXOs from espo (the same endpoint the rest
   * of the wallet uses), builds the transfer PSBT, signs it with this account's
   * keyring, and returns the finalized raw tx hex (the UI broadcasts it).
   *
   * Amounts arrive as strings (sats for BTC, raw 8-decimal for an alkane) since
   * bigints don't survive the port bridge.
   */
  async sendTransfer(params: {
    assetId: string; // "btc" or "block:tx"
    toAddress: string;
    rawAmount: string;
    feeRate: number;
  }): Promise<{ rawtx: string; fee: number }> {
    const account = storageService.currentAccount;
    if (!account?.address) throw new Error("No current account");

    const provider = espoProvider();

    let transfer: SingularTransfer;
    if (params.assetId === "btc") {
      transfer = {
        asset: "btc",
        amount: Number(params.rawAmount),
        address: params.toAddress,
      };
    } else {
      const [block, tx] = params.assetId.split(":");
      transfer = {
        asset: { block: BigInt(block), tx: BigInt(tx) },
        amount: BigInt(params.rawAmount),
        address: params.toAddress,
      };
    }

    const { psbtBase64, fee } = consumeOrThrow(
      await getProtostoneUnsignedPsbtBase64(account.address, {
        provider,
        transfers: [transfer],
        callData: [],
        feeRate: params.feeRate,
      })
    );

    const psbt = Psbt.fromBase64(psbtBase64);
    this.signPsbt(psbt);
    if (
      psbt.data.inputs.some((i) => !i.finalScriptWitness && !i.finalScriptSig)
    ) {
      psbt.finalizeAllInputs();
    }
    return { rawtx: psbt.extractTransaction().toHex(), fee };
  }

  /**
   * Build (and sign) a swap. Depending on the pair this is one transaction or a
   * CPFP package of two — BTC->token wraps then swaps, token->BTC swaps then
   * unwraps — with the parent at the relay floor and the child paying so the
   * PACKAGE hits the chosen feerate. Nothing is broadcast here; the caller
   * broadcasts `txs` IN ORDER (parent first, since the child spends its output).
   */
  async buildSwapPackage(params: {
    fromId: string; // "btc" or "block:tx"
    toId: string;
    /** exactIn: the amount spent. exactOut: the MAXIMUM spendable. */
    rawAmountIn: string;
    /** exactIn: the slippage floor. exactOut: the EXACT output requested. */
    minAmountOut: string;
    feeRate: number;
    mode?: "exactIn" | "exactOut";
    /** Expiry in blocks from the current tip; omitted/0 means no deadline. */
    deadlineBlocks?: number;
    /** FULL AMM-leg token path ("block:tx", BTC mapped to frBTC). */
    path?: string[];
  }): Promise<{
    txs: { hex: string; txid: string; label: string; vsize: number; fee: number }[];
    packageFeeRate?: number;
  }> {
    const account = storageService.currentAccount;
    if (!account?.address) throw new Error("No current account");

    const network = storageService.appState.network;
    const provider = espoProvider();
    const factoryId = parseAlkaneId(networkInfo(network).ammFactoryId);
    const asRef = (id: string): SwapAssetRef =>
      id === "btc" ? "btc" : parseAlkaneId(id);

    // The SDK expects a FINALIZED raw tx hex back, not a signed PSBT.
    const signPsbt = async (psbtBase64: string): Promise<string> => {
      const psbt = Psbt.fromBase64(psbtBase64);
      this.signPsbt(psbt);
      if (
        psbt.data.inputs.some((i) => !i.finalScriptWitness && !i.finalScriptSig)
      ) {
        psbt.finalizeAllInputs();
      }
      return psbt.extractTransaction().toHex();
    };

    // The contract compares the deadline against the block height, so turn the
    // user's "expire in N blocks" into an absolute height. 0 = no deadline.
    let deadline = 0n;
    if (params.deadlineBlocks && params.deadlineBlocks > 0) {
      const tip = await apiController.getLastBlock();
      if (tip) deadline = BigInt(tip + params.deadlineBlocks);
    }

    const result = consumeOrThrow(
      await buildSwapTransactions(
        account.address,
        {
          provider,
          network,
          from: asRef(params.fromId),
          to: asRef(params.toId),
          amountIn: BigInt(params.rawAmountIn),
          minAmountOut: BigInt(params.minAmountOut),
          feeRate: params.feeRate,
          factoryId,
          mode: params.mode ?? "exactIn",
          deadline,
          ...(params.path && params.path.length >= 2
            ? {
                path: params.path.map((id) => {
                  const [block, tx] = id.split(":");
                  return { block: BigInt(block), tx: BigInt(tx) };
                }),
              }
            : {}),
        },
        signPsbt
      )
    );

    return {
      txs: result.txs.map((tx) => ({
        hex: tx.hex,
        txid: tx.txid,
        label: tx.label,
        vsize: tx.vsize,
        fee: tx.fee,
      })),
      packageFeeRate: result.packageFeeRate,
    };
  }

  changeAddressType(index: number, addressType: AddressType): string[] {
    const keyring = this.keyrings[index];
    keyring.addressType = addressType;
    // HD wallets derive every account under a single BIP path, so the path has
    // to follow the address type (BIP84 segwit, BIP86 taproot, BIP44 legacy);
    // otherwise taproot would be derived on the segwit path. Re-derive the
    // same number of accounts on the new path. (Simple/private-key wallets
    // have no derivation path, only a script change.)
    if (keyring instanceof HDPrivateKey) {
      const count = keyring.accounts.length;
      keyring.changeHdPath(hdPathForAddressType(addressType));
      if (count > 0) keyring.addAccounts(count);
    }
    return keyring.getAccounts();
  }

  async deleteWallet(id: number) {
    if (storageService.appState.password === undefined)
      throw new Error("Internal error: Password is not defined");
    const newWallets = storageService.walletState.wallets
      .filter((i) => i.id !== id)
      .map((i, idx) => ({ ...i, id: idx }));

    await storageService.updateWalletState({
      wallets: newWallets,
    });

    this.keyrings.splice(id, 1);
    const payload = await storageService.saveWallets({
      password: storageService.appState.password,
      wallets: newWallets,
      seedToDelete: id,
    });
    return {
      wallets: newWallets,
      ...payload,
    };
  }

  async toggleRootAcc() {
    if (storageService.currentWallet?.id === undefined)
      throw new Error("Error when trying to get the current wallet");
    const currentWallet = storageService.currentWallet.id;
    (this.keyrings[currentWallet] as HDPrivateKey).toggleHideRoot();
    return this.keyrings[currentWallet].getAccounts();
  }

  async signPsbtWithoutFinalizing(psbt: Psbt, inputs?: UserToSignInput[]) {
    if (
      !storageService.currentAccount?.address ||
      !storageService.currentWallet
    )
      throw new Error(
        "Error when trying to get the current account or current account address or wallet"
      );
    const keyring = this.getKeyringByIndex(storageService.currentWallet.id);

    if (inputs === undefined)
      inputs = psbt.txInputs.map((_, i) => ({
        publicKey: this.exportPublicKey(
          storageService.currentAccount!.address!
        ),
        index: i,
        sighashTypes: undefined,
      }));

    if (
      keyring.addressType === AddressType.P2TR ||
      keyring.addressType === AddressType.M44_P2TR
    ) {
      inputs.forEach((input) => {
        const psbt_input = psbt.data.inputs[input.index];
        const isNotSigned = !(
          psbt_input.finalScriptSig || psbt_input.finalScriptWitness
        );
        const isP2TR =
          keyring.addressType === AddressType.P2TR ||
          keyring.addressType === AddressType.M44_P2TR;
        const lostInternalPubkey = !psbt_input.tapInternalKey;
        if (isNotSigned && isP2TR && lostInternalPubkey) {
          const tapInternalKey = toXOnly(
            Buffer.from(
              this.exportPublicKey(storageService.currentAccount!.address!),
              "hex"
            )
          );
          const { output } = payments.p2tr({
            internalPubkey: tapInternalKey,
            network: storageService.appState.network,
          });
          if (
            psbt_input.witnessUtxo?.script.toString("hex") ==
            output?.toString("hex")
          ) {
            psbt_input.tapInternalKey = tapInternalKey;
          }
        }
      });
    }

    try {
      keyring.signInputsWithoutFinalizing(
        psbt,
        inputs.map((f) => ({
          index: f.index,
          publicKey:
            (f as any).publicKey !== undefined
              ? (f as any).publicKey
              : this.exportPublicKey((f as any).address),
          sighashTypes: f.sighashTypes,
          disableTweakSigner: f.disableTweakSigner,
        }))
      );
    } catch (e) {
      console.error(e);
    }
  }

  verifyMessage(message: string, signatureHex: string) {
    if (!storageService.currentAccount?.address)
      throw new Error("Error when trying to get the current account");
    const keyring = this.getKeyringByIndex(storageService.currentAccount.id);
    return keyring.verifyMessage(
      storageService.currentAccount.address,
      message,
      signatureHex
    );
  }

  switchNetwork(network: Network) {
    this.keyrings.map((f) => f.setNetwork(network));
  }
}

export default new KeyringService();
