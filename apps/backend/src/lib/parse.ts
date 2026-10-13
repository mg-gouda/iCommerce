import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

/** zod → 400 invalid_data. */
export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {})
  if (!r.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, r.error.message)
  return r.data
}

/** Positive decimal with ≤3 decimals (quantities, MOQ). */
export const qty = z.number().positive().refine((n) => /^\d+(\.\d{1,3})?$/.test(String(n)), "max 3 decimals")
export const money = z.number().min(0)
export const listQuery = { limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) }
