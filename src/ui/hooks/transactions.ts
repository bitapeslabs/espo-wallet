import { useControllersState } from "../states/controllerState";
import { t } from "i18next";
import toast from "react-hot-toast";
import { ss } from "../utils";

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
