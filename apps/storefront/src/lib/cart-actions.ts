"use server"

import { refresh } from "next/cache"
import { sdk } from "@icommerce/sdk"
import { buyingMode, cartSalesChannel } from "./p3/mode"
import { auth, CART_COOKIE, countOf, getCart, setCookie, status } from "./session"
import { fitQty, isFractional, isRetail, listProducts, region } from "./store"

const product = async (id: string) => (await listProducts({ id: [id], limit: 1 })).products[0]

export type AddResult = { count?: number; error?: string }

/**
 * Adds a product (first variant) to the cookie cart, creating the cart in the buyer's sales channel if needed.
 * Retail products for everyone; any integer-quantity product for verified members in wholesale mode.
 * A 400 (Wholesale MOQ / step / max rule) comes back as the backend's sentence for inline display.
 */
export async function addToCart(productId: string, qty: number): Promise<AddResult> {
  const [p, { wholesale }] = await Promise.all([product(productId), buyingMode()])
  // ponytail: single-variant products only (all P1 products are); variant picker lands with variant products.
  const variant = p?.variants[0]
  if (!variant || !(wholesale || isRetail(p.product_extra)) || isFractional(p.product_extra)) return { error: "not_retail" }
  // Wholesale carts: the server enforces MOQ/step/max; retail: snap here.
  const quantity = wholesale ? qty : fitQty(qty, p.product_extra)
  const headers = await auth()
  try {
    const [open, channel] = await Promise.all([getCart(), cartSalesChannel()])
    let id = open?.id
    if (!id) {
      id = (await sdk.store.cart.create({ region_id: await region(), sales_channel_id: channel }, { fields: "id" }, headers)).cart.id
      await setCookie(CART_COOKIE, id)
    } else if (open!.sales_channel_id !== channel) {
      // Mode / verification changed since the cart was made → move it (prices recompute).
      await sdk.store.cart.update(id, { sales_channel_id: channel }, { fields: "id" }, headers)
    }
    const { cart } = await sdk.store.cart.createLineItem(id, { variant_id: variant.id, quantity }, { fields: "items.quantity" }, headers)
    return { count: countOf(cart) }
  } catch (e) {
    if ([400, 403].includes(status(e) ?? 0)) return { error: (e as Error).message }
    throw e
  }
}

/** Cart page stepper / remove (plain form → works without JS). qty 0 removes the line; others snap to MOQ/step. */
export async function setLineQty(fd: FormData) {
  const cart = await getCart()
  const line = cart?.items?.find((i) => i.id === fd.get("line"))
  if (!cart || !line) return
  const qty = Number(fd.get("qty"))
  const headers = await auth()
  if (qty > 0) {
    const p = await product(line.product_id!)
    await sdk.store.cart.updateLineItem(cart.id, line.id, { quantity: fitQty(qty, p?.product_extra ?? null) }, { fields: "id" }, headers)
  } else {
    await sdk.store.cart.deleteLineItem(cart.id, line.id, {}, headers)
  }
  refresh()
}
