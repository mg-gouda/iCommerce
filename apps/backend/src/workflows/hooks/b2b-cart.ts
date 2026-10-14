import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow, completeCartWorkflow, createCartWorkflow, updateCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { isB2bVerified, wholesaleChannelId } from "../../lib/company"
import { assertCartFeeCurrent } from "../../lib/fees"
import { assertNetTerms } from "../../lib/net-terms"
import { hiddenProductIds } from "../../lib/plans"
import { NET_TERMS_PROVIDER } from "../../modules/offline-payment/service"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const bad = (msg: string) => new MedusaError(MedusaError.Types.INVALID_DATA, msg)

async function loadCart(container: MedusaContainer, id: string, fields: string[]) {
  const { data: [cart] } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields, filters: { id } })
  return cart as Row
}

/** Wholesale carts only: line quantity must sit on the product's MOQ / step grid and under max. */
async function assertMoq(container: MedusaContainer, cart_id: string, lines: { variant_id?: string; item_id?: string; quantity: number }[]) {
  const cart = await loadCart(container, cart_id, ["id", "sales_channel_id", "items.id", "items.variant_id", "items.quantity"])
  if (!cart || cart.sales_channel_id !== (await wholesaleChannelId(container))) return
  const want = new Map<string, number>()
  for (const l of lines) {
    const existing = (cart.items ?? []).find((i: Row) => (l.item_id ? i.id === l.item_id : i.variant_id === l.variant_id))
    const variant_id = l.variant_id ?? existing?.variant_id
    if (!variant_id || (l.item_id && l.quantity === 0)) continue
    // add-to-cart merges into an existing line of the same variant → check the resulting quantity.
    want.set(variant_id, l.item_id ? l.quantity : (want.get(variant_id) ?? Number(existing?.quantity ?? 0)) + l.quantity)
  }
  if (!want.size) return
  const { data: variants } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "product.title", "product.product_extra.min_qty", "product.product_extra.max_qty", "product.product_extra.qty_step"],
    filters: { id: [...want.keys()] },
  })
  for (const v of variants as Row[]) {
    const q = want.get(v.id)!
    const e = v.product?.product_extra ?? {}
    const [min, max, step] = [e.min_qty, e.max_qty, e.qty_step].map((n) => (n == null ? null : Number(n)))
    const title = v.product?.title
    if (min && q < min) throw bad(`Minimum order quantity for "${title}" is ${min}.`)
    // Grid check in thousandths: MOQ/step allow 3 decimals.
    if (step && Math.round((q - (min ?? 0)) * 1000) % Math.round(step * 1000) !== 0) {
      throw bad(`Quantity for "${title}" must be ${min ?? 0} plus multiples of ${step}.`)
    }
    if (max && q > max) throw bad(`Maximum order quantity for "${title}" is ${max}.`)
  }
}

/** Wholesale channel = verified company members only (403 otherwise). */
async function assertWholesaleBuyer(container: MedusaContainer, sales_channel_id?: string | null, customer_id?: string | null) {
  if (!sales_channel_id || sales_channel_id !== (await wholesaleChannelId(container))) return
  if (!(await isB2bVerified(container, customer_id))) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "Wholesale carts are for signed-in members of verified companies.")
  }
}

/** P4: products of read-only vendors (past due beyond grace) can't be bought. */
async function assertNotHidden(container: MedusaContainer, variant_ids: string[]) {
  const hidden = variant_ids.length ? await hiddenProductIds(container) : []
  if (!hidden.length) return
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_variant", fields: ["id", "product_id"], filters: { id: variant_ids } })
  if ((data as Row[]).some((v) => hidden.includes(v.product_id))) throw bad("This product is currently unavailable.")
}

createCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const c = cart as Row
  await assertWholesaleBuyer(container, c.sales_channel_id, c.customer_id)
})

// Moving an existing cart onto the Wholesale channel.
updateCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const i = input as Row
  if (i.sales_channel_id) await assertWholesaleBuyer(container, i.sales_channel_id, i.customer_id ?? (cart as Row)?.customer_id)
})

addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const cart = await loadCart(container, input.cart_id, ["id", "sales_channel_id", "customer_id"])
  await assertWholesaleBuyer(container, cart?.sales_channel_id, cart?.customer_id)
  await assertNotHidden(container, (input.items ?? []).map((i) => i.variant_id).filter(Boolean) as string[])
  await assertMoq(container, input.cart_id, (input.items ?? []).map((i) => ({ variant_id: i.variant_id ?? undefined, quantity: Number(i.quantity) })))
})

updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  if (input.update?.quantity == null) return
  await assertMoq(container, input.cart_id, [{ item_id: input.item_id, quantity: Number(input.update.quantity) }])
})

// Platform fee must be current (P4). Net terms: the provider can't see companies, so eligibility + credit limit are
// enforced here, before authorization. One handler per hook → both live here.
completeCartWorkflow.hooks.validate(async ({ cart: c }, { container }) => {
  await assertCartFeeCurrent(container, (c as Row).id)
  const cart = await loadCart(container, (c as Row).id, ["id", "customer_id", "total", "payment_collection.payment_sessions.provider_id"])
  const net = (cart?.payment_collection?.payment_sessions ?? []).some((s: Row) => s?.provider_id === NET_TERMS_PROVIDER)
  if (net) await assertNetTerms(container, cart.customer_id, Number(cart.total))
})
