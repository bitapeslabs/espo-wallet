import type { ApiUTXO } from "@/shared/interfaces/api";
import { Network, Psbt, Transaction, address as addr } from "bitcoinjs-lib";
import { AddressType } from "./hdw";
import { getScriptForAddress, toXOnly } from "@/shared/utils/transactions";

export const DUST_LIMIT = 546;

export interface CreateSendBtcParams {
  utxos: ApiUTXO[];
  toAddress: string;
  toAmount: number;
  feeRate: number;
  network: Network;
  changeAddress: string;
  receiverToPayFee: boolean;
  publicKey: string;
  addressType: AddressType;
  signPsbt: (psbt: Psbt) => void;
  getTxHex: (txid: string) => Promise<string | undefined>;
}

/** Approximate vbyte sizes per input/output for supported address types. */
function inputVbytes(addressType: AddressType): number {
  switch (addressType) {
    case AddressType.P2PKH:
      return 148;
    case AddressType.P2TR:
    case AddressType.M44_P2TR:
      return 58;
    case AddressType.P2SH_P2WPKH:
      return 91;
    default:
      return 68; // P2WPKH
  }
}

function outputVbytes(outputAddress: string): number {
  // p2pkh 34, p2sh 32, p2wpkh 31, p2tr/p2wsh 43. Use a safe default when the
  // address cannot be parsed.
  if (/^(bc1p|tb1p|bcrt1p)/i.test(outputAddress)) return 43;
  if (/^(bc1q|tb1q|bcrt1q)/i.test(outputAddress)) return 31;
  return 34;
}

export function estimateFee(
  inputCount: number,
  addressType: AddressType,
  outputs: string[],
  feeRate: number
): number {
  const base = 11;
  const vsize =
    base +
    inputCount * inputVbytes(addressType) +
    outputs.reduce((acc, o) => acc + outputVbytes(o), 0);
  return Math.ceil(vsize * feeRate);
}

export async function createSendBtc({
  utxos,
  toAddress,
  toAmount,
  feeRate,
  network,
  changeAddress,
  receiverToPayFee,
  publicKey,
  addressType,
  signPsbt,
  getTxHex,
}: CreateSendBtcParams): Promise<Psbt> {
  if (!utxos.length) throw new Error("Not enough utxos");

  const pubkeyBuffer = Buffer.from(publicKey, "hex");
  const script = getScriptForAddress(pubkeyBuffer, addressType);
  if (!script)
    throw new Error("Internal error: Failed to get script for address");

  const totalIn = utxos.reduce((acc, cur) => acc + cur.value, 0);

  // Worst case: recipient + change output
  let fee = estimateFee(
    utxos.length,
    addressType,
    [toAddress, changeAddress],
    feeRate
  );

  let sendAmount = receiverToPayFee ? toAmount - fee : toAmount;
  let change = totalIn - sendAmount - fee;

  if (change < 0) throw new Error("Not enough balance");

  if (change < DUST_LIMIT) {
    // Not worth a change output: recompute fee without it and burn the rest
    fee = estimateFee(utxos.length, addressType, [toAddress], feeRate);
    sendAmount = receiverToPayFee ? toAmount - fee : toAmount;
    change = 0;
    if (totalIn - sendAmount - fee < 0) throw new Error("Not enough balance");
  }

  if (sendAmount <= DUST_LIMIT)
    throw new Error("Amount is too small (dust output)");

  const psbt = new Psbt({ network });

  const needsNonWitness = addressType === AddressType.P2PKH;
  const isTaproot =
    addressType === AddressType.P2TR || addressType === AddressType.M44_P2TR;

  for (const utxo of utxos) {
    if (needsNonWitness) {
      const hex = utxo.hex ?? (await getTxHex(utxo.txid));
      if (!hex)
        throw new Error(
          `Failed to get transaction hex for input ${utxo.txid}`
        );
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Transaction.fromHex(hex).toBuffer(),
      });
    } else {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: Buffer.from(script),
          value: utxo.value,
        },
        ...(isTaproot ? { tapInternalKey: toXOnly(pubkeyBuffer) } : {}),
      });
    }
  }

  // Validate the recipient address against the active network early so a
  // wrong-network address fails before signing
  addr.toOutputScript(toAddress, network);

  psbt.addOutput({ address: toAddress, value: sendAmount });
  if (change > 0) {
    psbt.addOutput({ address: changeAddress, value: change });
  }

  signPsbt(psbt);
  return psbt;
}
