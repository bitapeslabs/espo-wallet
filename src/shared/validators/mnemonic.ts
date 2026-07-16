import { z } from "zod";
import { validateMnemonic, wordlists } from "bip39";

const WORDS = wordlists.english;

export function isBip39Word(word: string): boolean {
  return WORDS.includes(word.trim().toLowerCase());
}

/** A complete, checksum-valid 12-word BIP39 mnemonic. */
export const mnemonicSchema = z
  .array(z.string())
  .length(12)
  .refine((words) => words.every((w) => isBip39Word(w)))
  .refine((words) => validateMnemonic(words.join(" ").trim()));

export function isValidMnemonic(words: (string | undefined)[]): boolean {
  return mnemonicSchema.safeParse(words.map((w) => (w ?? "").trim())).success;
}
