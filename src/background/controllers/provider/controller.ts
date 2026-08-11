import { Psbt } from "bitcoinjs-lib";
import { keyringService, storageService } from "../../services";
import "reflect-metadata/lite";
import permission from "@/background/services/permission";
import apiController from "../apiController";
import type { IEspoProvider, NetworkType } from "@/shared/interfaces/providerApi";
import { networkFromSlug, networkSlug } from "@/shared/networks";
import { ethErrors } from "eth-rpc-errors";
import walletController from "../walletController";

type IProviderController<
  K extends keyof IEspoProvider = keyof Omit<
    IEspoProvider,
    "on" | "removeListener"
  >
> = {
  [P in K]: (p: Payload<P>) => ReturnType<IEspoProvider[P]>;
};

type Payload<P extends keyof IEspoProvider> = {
  session: { origin: string };
  data: {
    params: Parameters<IEspoProvider[P]>;
  };
  approvalRes?: any;
};

class ProviderController implements IProviderController {
  connect = async () => {
    if (
      storageService.currentWallet === undefined ||
      !storageService.currentAccount
    )
      return "";
    const account = storageService.currentAccount.address;
    return account ?? "";
  };

  @Reflect.metadata("SAFE", true)
  getVersion = async () => {
    return process.env.VERSION ?? "0.0.1";
  };

  @Reflect.metadata("SAFE", true)
  getNetwork = async (): Promise<NetworkType> => {
    if (!storageService.appState.isReady) {
      await storageService.init();
    }
    return networkSlug(storageService.appState.network);
  };

  @Reflect.metadata("CONNECTED", true)
  getBalance = async () => {
    if (!storageService.currentAccount?.address)
      throw ethErrors.provider.chainDisconnected("Account not found");

    const stats = await apiController.getAccountStats(
      storageService.currentAccount.address
    );

    if (typeof stats === "undefined")
      throw ethErrors.provider.chainDisconnected();

    return stats.balance;
  };

  @Reflect.metadata("CONNECTED", true)
  getAccountName = async () => {
    if (!storageService.currentAccount?.address)
      throw ethErrors.provider.chainDisconnected("Account not found");

    return storageService.currentAccount.name;
  };

  @Reflect.metadata("SAFE", true)
  isConnected = async ({ session: { origin } }: Payload<"isConnected">) => {
    return permission.siteIsConnected(origin);
  };

  @Reflect.metadata("CONNECTED", true)
  getAccount = async () => {
    if (!storageService.currentAccount?.address)
      throw ethErrors.provider.chainDisconnected("Account not found");

    return storageService.currentAccount.address;
  };

  @Reflect.metadata("CONNECTED", true)
  calculateFee = async ({
    data: {
      params: [base64, feeRate],
    },
  }: Payload<"calculateFee">) => {
    const psbt = Psbt.fromBase64(base64);
    keyringService.signPsbt(psbt);
    let txSize = psbt.extractTransaction(true).toBuffer().length;
    psbt.data.inputs.forEach((v) => {
      if (v.finalScriptWitness) {
        txSize -= v.finalScriptWitness.length * 0.75;
      }
    });
    const fee = Math.ceil(txSize * feeRate);
    return fee;
  };

  @Reflect.metadata("CONNECTED", true)
  getPublicKey = async () => {
    if (!storageService.currentAccount?.address)
      throw ethErrors.provider.chainDisconnected("Account not found");

    return keyringService.exportPublicKey(
      storageService.currentAccount.address
    );
  };

  @Reflect.metadata("APPROVAL", ["SignText"])
  signMessage = async ({
    data: {
      params: [text],
    },
  }: Payload<"signMessage">) => {
    if (!storageService.currentAccount?.address)
      throw ethErrors.provider.chainDisconnected("Account not found");

    const message = keyringService.signMessage({
      from: storageService.currentAccount.address,
      data: text,
    });
    return message;
  };

  @Reflect.metadata("APPROVAL", ["CreateTx"])
  createTx = async ({
    data: {
      params: [payload],
    },
  }: Payload<"createTx">) => {
    if (!storageService.currentAccount?.address)
      throw ethErrors.provider.chainDisconnected("Account not found");

    const network = storageService.appState.network;

    // UTXO selection lives inside the alkanesjs builder; sendBTC returns the
    // finalized raw tx hex directly.
    return await keyringService.sendBTC({
      to: payload.to,
      amount: payload.amount,
      receiverToPayFee: payload.receiverToPayFee,
      feeRate: payload.feeRate,
      network,
    });
  };

  @Reflect.metadata("APPROVAL", ["signPsbt"])
  signPsbt = async ({
    data: {
      params: [psbtBase64, options],
    },
  }: Payload<"signPsbt">) => {
    const psbt = Psbt.fromBase64(psbtBase64);
    await keyringService.signPsbtWithoutFinalizing(psbt, options?.toSignInputs);
    return psbt.toBase64();
  };

  @Reflect.metadata("APPROVAL", ["multiPsbtSign"])
  multiPsbtSign = async ({
    data: {
      params: [items],
    },
  }: Payload<"multiPsbtSign">) => {
    return await Promise.all(
      items.map(async (f) => {
        const psbt = Psbt.fromBase64(f.psbtBase64);
        await keyringService.signPsbtWithoutFinalizing(
          psbt,
          f.options?.toSignInputs
        );
        return psbt.toBase64();
      })
    );
  };

  @Reflect.metadata("APPROVAL", ["switchNetwork"])
  switchNetwork = async ({
    data: {
      params: [networkStr],
    },
  }: Payload<"switchNetwork">) => {
    if (!storageService.currentWallet || !storageService.currentAccount) {
      throw ethErrors.provider.chainDisconnected("Account not found");
    }
    const network = networkFromSlug(
      networkStr === "regtest" ? "regtest" : "mainnet"
    );
    await walletController.switchNetwork(network);
    return networkStr;
  };
}

export default new ProviderController();
