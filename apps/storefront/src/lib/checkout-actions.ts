"use server"

import { redirect } from "next/navigation"
import { sdk } from "@icommerce/sdk"
import { paymentProviders, shippingGroups } from "./checkout"
import { EMAIL, parseAddress, routeLocale, str, type FormState } from "./forms"
import { auth, CART_COOKIE, clearCookie, getCart } from "./session"

// Each checkout section posts here; success → back to /checkout, which opens the next unfinished section.

const back = (fd: FormData): never => redirect(`/${routeLocale(fd)}/checkout`)

async function openCart() {
  const cart = await getCart()
  if (!cart?.items?.length) return null
  return cart
}

export async function saveEmail(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email")
  if (!EMAIL.test(email)) return { values: { email }, fieldErrors: { email: "email" } }
  const cart = await openCart()
  if (!cart) return { message: "cartGone" }
  await sdk.store.cart.update(cart.id, { email }, { fields: "id" }, await auth())
  return back(fd)
}

export async function saveAddress(_: FormState, fd: FormData): Promise<FormState> {
  const { values, fieldErrors, address } = parseAddress(fd)
  if (!address) return { values, fieldErrors }
  const cart = await openCart()
  if (!cart) return { message: "cartGone" }
  await sdk.store.cart.update(cart.id, { shipping_address: address, billing_address: address }, { fields: "id" }, await auth())
  return back(fd)
}

export async function saveShipping(_: FormState, fd: FormData): Promise<FormState> {
  const cart = await openCart()
  if (!cart) return { message: "cartGone" }
  const groups = await shippingGroups(cart.id)
  const picks = groups.map((g) => ({ g, id: str(fd, `ship_${g.profileId}`) }))
  const fieldErrors = Object.fromEntries(
    picks.filter(({ g, id }) => !g.options.some((o) => o.id === id)).map(({ g }) => [`ship_${g.profileId}`, "pickShipping"])
  )
  if (!groups.length || groups.some((g) => !g.options.length)) return { message: "noShipping" }
  if (Object.keys(fieldErrors).length) return { fieldErrors }
  const headers = await auth()
  // One method per vendor; re-adding for a profile replaces its old method. `data.vendor_handle` rides along to the
  // order's shipping method so a guest confirmation can name each vendor's method (vendor-orders needs an account).
  for (const { g, id } of picks)
    await sdk.store.cart.addShippingMethod(cart.id, { option_id: id, data: { vendor_handle: g.vendor?.handle ?? "" } }, { fields: "id" }, headers)
  return back(fd)
}

export async function savePayment(_: FormState, fd: FormData): Promise<FormState> {
  const provider = str(fd, "provider")
  const cart = await openCart()
  if (!cart) return { message: "cartGone" }
  if (!(await paymentProviders(cart.region_id!)).includes(provider)) return { fieldErrors: { provider: "pickPayment" } }
  await sdk.store.payment.initiatePaymentSession(cart, { provider_id: provider }, { fields: "id" }, await auth())
  return back(fd)
}

export async function placeOrder(_: FormState, fd: FormData): Promise<FormState> {
  const cart = await openCart()
  if (!cart) return { message: "cartGone" }
  const res = await sdk.store.cart.complete(cart.id, {}, await auth()).catch((e: Error) => ({ type: "cart" as const, error: e }))
  if (res.type !== "order") return { message: res.error?.message || "placeFailed" }
  await clearCookie(CART_COOKIE)
  redirect(`/${routeLocale(fd)}/order/${res.order.id}`)
}
