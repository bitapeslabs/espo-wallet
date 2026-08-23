import { KeyringServiceError } from "./consts";
import type { Hex, Json, SendBTC, UserToSignInput } from "./types";
import { storageService } from "@/background/services";
import { espoProvider } from "@/background/services/espoProvider";
import { Network, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { toXOnly } from "@/shared/utils/transactions";
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
import { Account, type Provider } from "alkanesjs";
import { buildSwapPackageTxs } from "./swapBuilder";
import { networkInfo } from "@/shared/networks";

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

  /**
   * A plain BTC send for the dapp `createTx` API, built through the same
   * alkanesjs account as everything else (espo-driven, token-safe UTXO
   * selection; no protostone on a pure BTC send). `receiverToPayFee` (the fee
   * comes out of the recipient's amount) has no SDK switch, so it is emulated:
   * build once to learn the fee, rebuild with the reduced amount — the
   * structure is unchanged, so the fee carries over. Returns the FINALIZED
   * raw tx hex.
   */
  async sendBTC(data: SendBTC): Promise<string> {
    const provider = espoProvider();
    const me = this.sdkAccount(provider, data.feeRate);
    const build = (sats: bigint) =>
      me.tx().transfer("sats", sats, data.to).build({ feeRate: data.feeRate });

    let built = await build(BigInt(data.amount));
    if (data.receiverToPayFee) {
      const fee = this.psbtFee(built.psbtBase64);
      if (fee >= data.amount)
        throw new Error("Fee exceeds the amount to send");
      built = await build(BigInt(data.amount - fee));
    }
    return built.hex;
  }

  /**
   * The current account as an alkanesjs `Account`. The SDK never sees a key:
   * it hands an unsigned base64 PSBT to this keyring's own `signPsbt`, which
   * signs and FINALIZES it in-process (the SDK extracts the transaction from
   * what comes back, so an unfinalized PSBT would throw).
   */
  private sdkAccount(provider: Provider, feeRate?: number): Account {
    const account = storageService.currentAccount;
    if (!account?.address) throw new Error("No current account");
    return Account.fromSignPsbt(
      async (unsignedPsbtBase64: string) => {
        const psbt = Psbt.fromBase64(unsignedPsbtBase64);
        this.signPsbt(psbt);
        if (
          psbt.data.inputs.some(
            (i) => !i.finalScriptWitness && !i.finalScriptSig
          )
        ) {
          psbt.finalizeAllInputs();
        }
        return psbt.toBase64();
      },
      account.address,
      provider,
      // The rate rides on the account because chained package builds
      // (buildChain) take no per-build options.
      feeRate !== undefined ? { feeRate } : {}
    );
  }

  /** Fee actually paid by a built PSBT: input sum minus output sum. */
  private psbtFee(psbtBase64: string): number {
    const psbt = Psbt.fromBase64(psbtBase64);
    let inSum = 0;
    psbt.data.inputs.forEach((input, i) => {
      if (input.witnessUtxo) {
        inSum += input.witnessUtxo.value;
      } else if (input.nonWitnessUtxo) {
        const prev = Transaction.fromBuffer(input.nonWitnessUtxo);
        inSum += prev.outs[psbt.txInputs[i].index].value;
      }
    });
    const outSum = psbt.txOutputs.reduce((sum, out) => sum + out.value, 0);
    return inSum - outSum;
  }

  /**
   * Build + sign a transfer (BTC or an alkane) with alkanesjs — the wallet's
   * PSBT builder for both. `account.tx().transfer(...)` pulls UTXOs from espo,
   * builds the (protostone) transfer, signs through this keyring, and the
   * finalized raw tx hex goes back to the UI, which broadcasts it.
   *
   * Amounts arrive as strings (sats for BTC, raw 8-decimal for an alkane) since
   * bigints don't survive the port bridge. A pure BTC send writes no protostone
   * and no dust output — the builder omits them when nothing alkane rides in.
   */
  async sendTransfer(params: {
    assetId: string; // "btc" or "block:tx"
    toAddress: string;
    rawAmount: string;
    feeRate: number;
  }): Promise<{ rawtx: string; fee: number }> {
    const provider = espoProvider();
    const me = this.sdkAccount(provider);

    const tx = me.tx();
    if (params.assetId === "btc") {
      tx.transfer("sats", BigInt(params.rawAmount), params.toAddress);
    } else {
      const [block, txPart] = params.assetId.split(":");
      tx.transfer(
        { block: BigInt(block), tx: BigInt(txPart) },
        BigInt(params.rawAmount),
        params.toAddress
      );
    }

    const built = await tx.build({ feeRate: params.feeRate });
    return { rawtx: built.hex, fee: this.psbtFee(built.psbtBase64) };
  }

  /**
   * Build (and sign) a swap. Depending on the pair this is one transaction or a
   * CPFP package of two — BTC->token wraps then swaps, token->BTC swaps then
   * unwraps. Both package txs are built at the chosen feerate (each must relay
   * on its own, since the wallet broadcasts them individually). Nothing is
   * broadcast here; the caller broadcasts `txs` IN ORDER (parent first, since
   * the child spends its output). Composition lives in ./swapBuilder.
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
    const network = storageService.appState.network;
    const provider = espoProvider();
    const me = this.sdkAccount(provider, params.feeRate);
    const info = networkInfo(network);

    // The contract compares the deadline against the block height, so turn the
    // user's "expire in N blocks" into an absolute height. 0 = no deadline.
    let deadline = 0n;
    if (params.deadlineBlocks && params.deadlineBlocks > 0) {
      const tip = await apiController.getLastBlock();
      if (tip) deadline = BigInt(tip + params.deadlineBlocks);
    }

    return await buildSwapPackageTxs({
      account: me,
      provider,
      fromId: params.fromId,
      toId: params.toId,
      amountIn: BigInt(params.rawAmountIn),
      minAmountOut: BigInt(params.minAmountOut),
      feeRate: params.feeRate,
      mode: params.mode ?? "exactIn",
      deadline,
      factoryId: info.ammFactoryId,
      frbtcId: info.frbtcId,
      ...(params.path && params.path.length >= 2 ? { path: params.path } : {}),
    });
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

    /*
      Signing failures are NOT swallowed: a dapp that asked us to sign an
      input we cannot sign (eg it connected with an address that is no
      longer the active account) must hear the real reason. Silently
      returning the unsigned psbt surfaced downstream as bitcoinjs's
      opaque "Not finalized" when the dapp extracted the transaction.
    */
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
      console.error("signPsbt failed", e);
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Espo Wallet could not sign this transaction with the active account ` +
          `(${storageService.currentAccount.address}): ${reason}`
      );
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
