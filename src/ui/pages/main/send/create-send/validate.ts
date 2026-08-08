import { z } from "zod";
import type { Network } from "bitcoinjs-lib";
import { getAddressType } from "@/ui/utils";

/** Decimal display string -> raw 8-decimal base units (sats / alkane raw). */
export function toRawAmount(value: string): bigint {
  const [int = "0", frac = ""] = (value ?? "").split(".");
  const fracPadded = (frac + "00000000").slice(0, 8);
  return BigInt(int || "0") * 100000000n + BigInt(fracPadded || "0");
}

/**
 * The send form's zod schema, parameterised by the active network (for address
 * validity) and the available balance (raw base units). A valid parse means the
 * form can be submitted.
 */
export function sendFormSchema(network: Network, rawBalance: bigint) {
  return z.object({
    address: z
      .string()
      .trim()
      .min(1)
      .refine((a) => getAddressType(a, network) !== undefined, {
        message: "address",
      }),
    amount: z
      .string()
      .refine((v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n > 0;
      })
      .refine((v) => toRawAmount(v) <= rawBalance, { message: "balance" }),
  });
}

export interface SendFormValidation {
  /** Whole-form validity — gates the Continue button. */
  canSubmit: boolean;
  /** Address has been typed but is invalid for the network. */
  addressError: boolean;
  /** Amount has been typed but is non-positive or exceeds the balance. */
  amountError: boolean;
  /** Amount specifically exceeds the available balance (for toast wording). */
  amountExceeds: boolean;
}

/**
 * Run the send-form schema and derive per-field flags for the UI (red input
 * borders) plus the whole-form gate. A field only reads as "error" once the
 * user has actually typed into it.
 */
export function validateSendForm(
  address: string | null | undefined,
  amount: string | null | undefined,
  network: Network,
  rawBalance: bigint
): SendFormValidation {
  // The address combobox can hand back null when its selection is cleared, so
  // never assume these are strings.
  const addr = address ?? "";
  const amountStr = amount ?? "";

  const res = sendFormSchema(network, rawBalance).safeParse({
    address: addr,
    amount: amountStr,
  });
  const issues = res.success ? [] : res.error.issues;
  const has = (path: string) => issues.some((i) => i.path[0] === path);

  const amt = parseFloat(amountStr);
  const exceeds =
    amountStr.trim().length > 0 &&
    Number.isFinite(amt) &&
    amt > 0 &&
    toRawAmount(amountStr) > rawBalance;

  return {
    canSubmit: res.success,
    addressError: addr.trim().length > 0 && has("address"),
    amountError: amountStr.trim().length > 0 && has("amount"),
    amountExceeds: exceeds,
  };
}
