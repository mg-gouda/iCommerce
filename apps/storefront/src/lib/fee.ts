// Platform fee (p4-backend.md §1): a cart / order line whose metadata.platform_fee holds the snapshot.

export type PlatformFee = {
  amount: number
  channel: "b2b" | "b2c"
  basis: "monthly_volume" | "order_total"
  percent: number
  fixed_amount: number
  min_fee: number | null
  max_fee: number | null
  min_amount: number
  subtotal: number
  monthly_volume: number | null
  base: number
  label_en: string
  label_ar: string
}

type Line = { metadata?: Record<string, unknown> | null }

export const isFeeLine = (l: Line) => !!l.metadata?.platform_fee
/** Fee snapshot of a cart / order (null = no fee). */
export const feeOf = (items: Line[] | null | undefined) =>
  ((items ?? []).find(isFeeLine)?.metadata?.platform_fee as PlatformFee | undefined) ?? null
/** Product lines only (the fee line is never a product). */
export const productLines = <T extends Line>(items: T[] | null | undefined) => (items ?? []).filter((l) => !isFeeLine(l))
