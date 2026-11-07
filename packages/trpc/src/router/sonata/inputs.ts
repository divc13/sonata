import { isValidTokenId, TOKEN_ID_PATTERN } from "@infinitunes/near";
import { z } from "zod";

/** Master slug accepted by the collection and safe as an account-id prefix. */
export const tokenIdInput = z
  .string()
  .min(3)
  .max(40)
  .regex(TOKEN_ID_PATTERN, "Use 3-40 lowercase letters, digits or hyphens")
  .refine(isValidTokenId, "That token id is reserved");

/**
 * Micro-USDC (6 decimals) as a positive integer string. Rejects floats,
 * sci-notation, signs and zero so a caller cannot accidentally send `0`.
 */
export const microUsdcInput = z
  .string()
  .regex(/^[1-9]\d*$/, "Use a positive micro-USDC integer string")
  .max(30, "That amount is too large");
