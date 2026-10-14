import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { money } from "../../../lib/parse"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => (v == null ? null : Number(v))

export const FeeTierBody = z
  .object({
    channel: z.enum(["b2b", "b2c"]),
    basis: z.enum(["monthly_volume", "order_total"]),
    min_amount: money,
    percent: z.number().min(0).max(100),
    fixed_amount: money.optional(),
    min_fee: money.nullable().optional(),
    max_fee: money.nullable().optional(),
    active_from: z.coerce.date().nullable().optional(),
    active_to: z.coerce.date().nullable().optional(),
    label_en: z.string().trim().min(1).max(80),
    label_ar: z.string().trim().min(1).max(80),
  })
  .strict()

/** Cross-field rules on the merged row (create or update). */
export function checkTier(t: Row) {
  const fail = (m: string) => {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, m)
  }
  if (t.min_fee != null && t.max_fee != null && Number(t.min_fee) > Number(t.max_fee)) fail("min_fee must be ≤ max_fee.")
  if (t.active_from && t.active_to && new Date(t.active_from) >= new Date(t.active_to)) fail("active_from must be before active_to.")
}

export const shapeTier = (t: Row) => ({
  id: t.id, channel: t.channel, basis: t.basis, min_amount: Number(t.min_amount), percent: Number(t.percent), fixed_amount: Number(t.fixed_amount),
  min_fee: n(t.min_fee), max_fee: n(t.max_fee), currency: t.currency, active_from: t.active_from, active_to: t.active_to,
  label_en: t.label_en, label_ar: t.label_ar, created_at: t.created_at, updated_at: t.updated_at,
})
