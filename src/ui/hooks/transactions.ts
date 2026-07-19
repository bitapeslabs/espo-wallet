import { useGetCurrentAccount, useWalletState } from "../states/walletState";
import { useControllersState } from "../states/controllerState";
import { satoshisToAmount } from "@/shared/utils/transactions";
import { Psbt } from "bitcoinjs-lib";
import type { Hex } from "@/background/services/keyring/types";
import { t } from "i18next";
import toast from "react-hot-toast";
import { gptFeeCalculate, ss } from "../utils";
import { useAppState } from "../states/appState";

/**
 * Build + sign a transfer (BTC or an alkane) through alkanesjs (in the
 * background), returning the finalized raw tx hex ready to broadcast.
 * `assetId` is "btc" or an alkane "block:tx"; `rawAmount` is in base units
 * (sats / raw 8-decimal), passed as a string across the port bridge.
 */
export function useCreateTransferCallback() {
  const { keyringController } = useControllersState(ss(["keyringController"]));
  return async (
    assetId: string,
    toAddress: string,
    rawAmount: bigint,
    feeRate: number
  ): Promise<{ rawtx: string; fee: number }> => {
    return keyringController.sendTransfer({
      assetId,
      toAddress,
      rawAmount: rawAmount.toString(),
      feeRate,
    });
  };
}

export function useCreateBtcTxCallback() {
  const { selectedAccount, selectedWallet } = useWalletState(
    ss(["selectedAccount", "selectedWallet"])
  );
  const currentAccount = useGetCurrentAccount();
  const { apiController, keyringController } = useControllersState(
    ss(["apiController", "keyringController"])
  );
  const { network } = useAppState(ss(["network"]));

  return async (
    toAddress: Hex,
    toAmount: number,
    feeRate: number,
    receiverToPayFee = false
  ): Promise<{ rawtx: string; fee: number } | undefined> => {
    if (
      selectedWallet === undefined ||
      selectedAccount === undefined ||
      currentAccount === undefined ||
      currentAccount.address === undefined
    )
      throw new Error("Failed to get current wallet or account");
    const fromAddress = currentAccount.address;

    let fee = gptFeeCalculate(2, 2, feeRate);

    let totalAmount = toAmount + (receiverToPayFee ? 0 : fee);

    let utxos = await apiController.getUtxos(fromAddress, {
      amount: totalAmount,
    });

    if ((utxos?.length ?? 0) > 5 && !receiverToPayFee) {
      fee = gptFeeCalculate(utxos!.length, 2, feeRate);
      totalAmount = toAmount + (receiverToPayFee ? 0 : fee);

      utxos = await apiController.getUtxos(fromAddress, {
        amount: totalAmount,
      });
    }

    if (!Array.isArray(utxos)) {
      toast.error(t("send.create_send.not_enough_money_error"));
      return;
    }

    if (utxos.length > 500) {
      throw new Error(t("hooks.transaction.too_many_utxos"));
    }

    const safeBalance = utxos.reduce((pre, cur) => pre + cur.value, 0);

    if (receiverToPayFee && fee > toAmount) {
      toast.error(t("send.create_send.fee_exceeds_amount_error"));
      return;
    }

    if (safeBalance < totalAmount) {
      throw new Error(
        `${t("hooks.transaction.insufficient_balance_0")} (${satoshisToAmount(
          safeBalance
        )} ${t("hooks.transaction.insufficient_balance_1")} ${satoshisToAmount(
          totalAmount
        )} ${t("hooks.transaction.insufficient_balance_2")}`
      );
    }

    const psbtHex = await keyringController.sendBTC({
      to: toAddress,
      amount: toAmount,
      utxos,
      receiverToPayFee,
      feeRate,
      network,
    });
    const psbt = Psbt.fromHex(psbtHex);
    const tx = psbt.extractTransaction(true);
    const rawtx = tx.toHex();
    return {
      rawtx,
      fee: psbt.getFee(),
    };
  };
}

export function usePushBtcTxCallback() {
  const { apiController } = useControllersState(ss(["apiController"]));

  return async (rawtx: string) => {
    try {
      return await apiController.pushTx(rawtx);
    } catch (e) {
      const error = e as Error;
      if ("message" in error) {
        if (error.message.includes("too-long-mempool-chain")) {
          toast.error(t("hooks.transaction.too_long_mempool_chain"));
        } else {
          toast.error(error.message);
        }
      }
    }
  };
}
