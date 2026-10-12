"use server"

import { refresh } from "next/cache"
import { sdk } from "@icommerce/sdk"
import { auth, CART_COOKIE, countOf, getCart, setCookie } from "./session"
import { fitQty, isRetail, listProducts, region } from "./store"

const product = async (id: string) => (await listProducts({ id: [id], limit: 1 })).products[0]

/** Adds a retail product (first variant) to the cookie cart, creating the cart if needed. Returns the new item count. */
export async function addToCart(productId: string, qty: number) {
  const p = await product(productId)
  // ponytail: single-variant products only (all P1 products are); variant picker lands with variant products.
  const variant = p?.variants[0]
  if (!variant || !isRetail(p.product_extra)) throw new Error("not_retail")
  const quantity = fitQty(qty, p.product_extra)
  const headers = await auth()
  let id = (await getCart())?.id
  if (!id) {
    id = (await sdk.store.cart.create({ region_id: await region() }, { fields: "id" }, headers)).cart.id
    await setCookie(CART_COOKIE, id)
  }
  const { cart } = await sdk.store.cart.createLineItem(id, { variant_id: variant.id, quantity }, { fields: "items.quantity" }, headers)
  return countOf(cart)
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
