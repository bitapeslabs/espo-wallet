import { z } from "zod";

/**
 * Password strength score, mirroring b8's implementation: one point each for
 * 8+ chars, 12+ chars, mixed case, a digit, and a symbol.
 */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

/** b8's policy: at least 8 chars AND a score of 3 ("Good") or better. */
export const MIN_PASSWORD_STRENGTH = 3;

export interface StrengthStep {
  segs: number;
  color: string;
  /** i18n key under components.password_strength */
  labelKey: string;
}

export const STRENGTH_STEPS: StrengthStep[] = [
  { segs: 1, color: "var(--danger)", labelKey: "too_weak" },
  { segs: 2, color: "var(--warning)", labelKey: "weak" },
  { segs: 3, color: "#b8d94a", labelKey: "good" },
  { segs: 4, color: "var(--success)", labelKey: "strong" },
];

export function strengthStep(score: number): StrengthStep {
  return STRENGTH_STEPS[Math.max(0, Math.min(3, score - 1))];
}

export const createPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8)
      .max(70)
      .refine((p) => passwordStrength(p) >= MIN_PASSWORD_STRENGTH),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword);

export type CreatePasswordForm = z.infer<typeof createPasswordSchema>;
