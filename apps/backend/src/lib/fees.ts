import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { FEE_MODULE } from "../modules/fee"
import type FeeModuleService from "../modules/fee/service"
import { companySvc, wholesaleChannelId } from "./company"
import { activeAt, cents, major, rateCents } from "./money"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export type Channel = "b2b" | "b2c"
export type PlatformFee = {
  amount: number
  tier_id: string
  channel: Channel
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

export const feeSvc = (scope: MedusaContainer): FeeModuleService => scope.resolve(FEE_MODULE)
export const isFeeLine = (i: Row | null | undefined) => !!i?.metadata?.platform_fee
const num = (n: unknown) => (n == null ? null : Number(n))

export const channelOf = async (scope: MedusaContainer, sales_channel_id?: string | null): Promise<Channel> =>
  sales_channel_id && sales_channel_id === (await wholesaleChannelId(scope)) ? "b2b" : "b2c"

/** Σ non-fee line subtotals (unit_price × quantity), cents. */
export const subtotalCents = (items: Row[]) =>
  items.filter((i) => !isFeeLine(i)).reduce((s, i) => s + cents(Number(i.unit_price) * Number(i.quantity ?? i.detail?.quantity)), 0)

/**
 * Buyer's volume this calendar month (UTC), cents: Σ subtotals of parent orders created this month, not canceled/draft.
 * Buyer = all members of the customer's company (b2b), else the customer alone. Guests → 0.
 */
export async function monthlyVolumeCents(scope: MedusaContainer, channel: Channel, customer_id?: string | null, now = new Date()) {
  if (!customer_id) return 0
  let ids = [customer_id]
  if (channel === "b2b") {
    const [m] = await companySvc(scope).listCompanyMembers({ customer_id })
    const company_id = (m as Row | undefined)?.company_id
    if (company_id) ids = (await companySvc(scope).listCompanyMembers({ company_id })).map((x) => x.customer_id)
  }
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "items.id", "items.unit_price", "items.quantity", "items.detail.quantity", "items.metadata"],
    filters: {
      customer_id: ids,
      created_at: { $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) },
      status: { $nin: ["canceled", "draft"] },
      metadata: { parent_order_id: null },
    } as never,
  })
  return (data as Row[]).reduce((s, o) => s + subtotalCents(o.items ?? []), 0)
}

/** Floor tier for the channel: highest min_amount ≤ base (base per tier basis); ties → newest. */
export function pickTier(tiers: Row[], channel: Channel, subtotal: number, volume: number, at = new Date()) {
  return tiers
    .filter((t) => t.channel === channel && activeAt(t, at))
    .filter((t) => cents(t.min_amount) <= (t.basis === "monthly_volume" ? volume + subtotal : subtotal))
    .sort((a, b) => cents(b.min_amount) - cents(a.min_amount) || +new Date(b.created_at) - +new Date(a.created_at))[0]
}

/** Fee for a subtotal (cents) + prior monthly volume (cents). null = no tier or zero fee. */
export function computeFee(tiers: Row[], channel: Channel, subtotal: number, volume: number, at = new Date()): PlatformFee | null {
  if (subtotal <= 0) return null
  const t = pickTier(tiers, channel, subtotal, volume, at)
  if (!t) return null
  const amount = rateCents(subtotal, t.percent, t.fixed_amount, t.min_fee, t.max_fee)
  if (!amount) return null
  const monthly = t.basis === "monthly_volume"
  return {
    amount: major(amount), tier_id: t.id, channel, basis: t.basis,
    percent: Number(t.percent), fixed_amount: Number(t.fixed_amount), min_fee: num(t.min_fee), max_fee: num(t.max_fee), min_amount: Number(t.min_amount),
    subtotal: major(subtotal), monthly_volume: monthly ? major(volume) : null, base: major(monthly ? volume + subtotal : subtotal),
    label_en: t.label_en, label_ar: t.label_ar,
  }
}

/** Fee for a buyer: loads tiers, and the monthly volume only when a monthly tier exists for the channel. */
export async function resolveFee(scope: MedusaContainer, o: { channel: Channel; customer_id?: string | null; subtotal: number }) {
  const tiers = await feeSvc(scope).listFeeTiers({ channel: o.channel })
  if (!tiers.length || o.subtotal <= 0) return null
  const volume = tiers.some((t) => t.basis === "monthly_volume") ? await monthlyVolumeCents(scope, o.channel, o.customer_id) : 0
  return computeFee(tiers as Row[], o.channel, o.subtotal, volume)
}

// jsonb reorders keys → compare on a fixed key list, not JSON.stringify.
const feeKey = (f?: Row | null) => (f ? [f.amount, f.tier_id, f.base, f.monthly_volume, f.label_en, f.label_ar].join("|") : "")
const CART_FIELDS = ["id", "sales_channel_id", "customer_id", "items.id", "items.unit_price", "items.quantity", "items.metadata"]

/** What the cart's fee should be now + its current fee lines. */
export async function cartFee(scope: MedusaContainer, cart_id: string) {
  const { data: [cart] } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cart_id } })
  if (!cart) return null
  const items = (cart.items ?? []) as Row[]
  const fee = await resolveFee(scope, { channel: await channelOf(scope, cart.sales_channel_id), customer_id: cart.customer_id, subtotal: subtotalCents(items) })
  return { fee, lines: items.filter(isFeeLine) }
}

/**
 * Keeps the cart's platform-fee line (custom line item, no variant) in sync. Runs inside refreshCartItemsWorkflow
 * (hook beforeRefreshingPaymentCollection), so the payment collection refresh that follows sees the new total.
 */
export async function syncCartFee(scope: MedusaContainer, cart_id: string) {
  const r = await cartFee(scope, cart_id)
  if (!r) return
  const cart = scope.resolve(Modules.CART)
  const [line, ...dupes] = r.lines
  const drop = (r.fee ? dupes : r.lines).map((l) => l.id as string)
  if (drop.length) await cart.deleteLineItems(drop)
  if (!r.fee) return
  const data = { title: r.fee.label_en, unit_price: r.fee.amount, quantity: 1, metadata: { platform_fee: r.fee } }
  if (!line) {
    await cart.addLineItems({
      cart_id, ...data, is_custom_price: true, requires_shipping: false, is_discountable: false, is_tax_inclusive: false,
    } as never)
  } else if (feeKey(line.metadata?.platform_fee) !== feeKey(r.fee) || Number(line.quantity) !== 1 || Number(line.unit_price) !== r.fee.amount) {
    await cart.updateLineItems(line.id, data)
  }
}

/** completeCart guard: the fee line must match what the fee is now (volume may have moved). Never mutates (Medusa rule). */
export async function assertCartFeeCurrent(scope: MedusaContainer, cart_id: string) {
  const r = await cartFee(scope, cart_id)
  if (!r) return
  const have = r.lines.map((l) => cents(Number(l.unit_price) * Number(l.quantity)))
  const want = r.fee ? [cents(r.fee.amount)] : []
  if (have.join() !== want.join()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Platform fee changed. Please review your cart.")
  }
}

/** Order line input for a fee (quote → order). */
export const feeOrderLine = (fee: PlatformFee) => ({
  title: fee.label_en, quantity: 1, unit_price: fee.amount, is_tax_inclusive: false, requires_shipping: false, is_discountable: false,
  is_custom_price: true, metadata: { platform_fee: fee },
})
