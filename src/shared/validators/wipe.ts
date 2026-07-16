import { z } from "zod";

/** The exact phrase the user must type to confirm wiping the wallet. */
export const WIPE_CONFIRM_PHRASE = "CONFIRM";

export const wipeConfirmSchema = z.object({
  confirm: z.literal(WIPE_CONFIRM_PHRASE),
});

export function isWipeConfirmed(value: string): boolean {
  return wipeConfirmSchema.safeParse({ confirm: value }).success;
}
