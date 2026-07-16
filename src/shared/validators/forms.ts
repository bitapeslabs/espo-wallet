import { z } from "zod";

/** A single non-empty password field (unlock, secret-reveal gate). */
export const passwordEntrySchema = z.object({
  password: z.string().min(1),
});

export function isPasswordEntered(password: string): boolean {
  return passwordEntrySchema.safeParse({ password }).success;
}

/** Wallet / account rename: trimmed, 1..10 chars. */
export const nameSchema = z.object({
  name: z.string().trim().min(1).max(10),
});

export function isValidName(name: string): boolean {
  return nameSchema.safeParse({ name }).success;
}

/** A private key import: 64-char hex OR a base58 WIF (51-52 chars). */
export const privateKeySchema = z.object({
  privKey: z
    .string()
    .trim()
    .refine(
      (v) =>
        /^[0-9a-fA-F]{64}$/.test(v) ||
        /^[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(v)
    ),
});

export function isValidPrivateKey(privKey: string): boolean {
  return privateKeySchema.safeParse({ privKey }).success;
}

/** Change password: old present, new reaches "Good" strength, new matches. */
export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword);

export function isChangePasswordValid(data: {
  oldPassword: string;
  password: string;
  confirmPassword: string;
}): boolean {
  return changePasswordSchema.safeParse(data).success;
}

/** Send form: a recipient address and a positive amount. */
export const sendSchema = z.object({
  address: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
});

export function isSendValid(address: string, amount: string): boolean {
  return sendSchema.safeParse({ address, amount }).success;
}
