import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow, completeCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { wholesaleChannelId } from "../../lib/company"
import { assertNetTerms } from "../../lib/net-terms"
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

addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  await assertMoq(container, input.cart_id, (input.items ?? []).map((i) => ({ variant_id: i.variant_id ?? undefined, quantity: Number(i.quantity) })))
})

updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  if (input.update?.quantity == null) return
  await assertMoq(container, input.cart_id, [{ item_id: input.item_id, quantity: Number(input.update.quantity) }])
})

// Net terms: the provider can't see companies, so eligibility + credit limit are enforced here, before authorization.
completeCartWorkflow.hooks.validate(async ({ cart: c }, { container }) => {
  const cart = await loadCart(container, (c as Row).id, ["id", "customer_id", "total", "payment_collection.payment_sessions.provider_id"])
  const net = (cart?.payment_collection?.payment_sessions ?? []).some((s: Row) => s?.provider_id === NET_TERMS_PROVIDER)
  if (net) await assertNetTerms(container, cart.customer_id, Number(cart.total))
})
