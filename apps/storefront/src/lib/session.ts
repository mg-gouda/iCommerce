import { cookies, headers } from "next/headers"
import { sdk } from "@icommerce/sdk"

// Server-only session: cart id + customer JWT live in httpOnly cookies, never in the browser's JS.
// Every call passes its own auth header; the shared sdk instance never stores a token.

export const CART_COOKIE = "ic_cart"
export const TOKEN_COOKIE = "ic_token"
/** Guest tracking lookup `{ n, email }` (JSON), so the email never sits in a URL. */
export const TRACK_COOKIE = "ic_track"

const opts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
})

export async function setCookie(name: string, value: string) {
  // Medusa customer JWTs expire after 1 day by default (tracking lookups too); carts live a month.
  ;(await cookies()).set(name, value, opts(name === CART_COOKIE ? 60 * 60 * 24 * 30 : 60 * 60 * 24))
}
export const clearCookie = async (name: string) => (await cookies()).delete(name)

export const token = async () => (await cookies()).get(TOKEN_COOKIE)?.value
export const cartId = async () => (await cookies()).get(CART_COOKIE)?.value

/** Bearer header for the signed-in customer, or none (guest). */
export async function auth(): Promise<Record<string, string>> {
  const t = await token()
  return t ? { authorization: `Bearer ${t}` } : {}
}

/** Shopper's IP for backend rate limits (guest order lookups), forwarded as X-Forwarded-For. */
export async function clientIp(): Promise<Record<string, string>> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim()
  return ip ? { "x-forwarded-for": ip } : {}
}

export const status = (e: unknown) => (e as { status?: number }).status

/** Treats "gone" (404, completed cart) as null; other errors bubble. */
export async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (e) {
    if ([400, 401, 404].includes(status(e) ?? 0)) return null
    throw e
  }
}

export type Cart = Awaited<ReturnType<typeof sdk.store.cart.retrieve>>["cart"]
export type Customer = Awaited<ReturnType<typeof sdk.store.customer.retrieve>>["customer"]
export type Order = Awaited<ReturnType<typeof sdk.store.order.retrieve>>["order"]

const CART_FIELDS = [
  "id", "email", "currency_code", "region_id", "customer_id", "completed_at",
  "item_subtotal", "shipping_total", "total",
  "*items", "*shipping_address", "*shipping_methods",
  "*payment_collection", "*payment_collection.payment_sessions",
].join(",")

/** The open cart from the cookie, or null (none, expired, or already completed). */
export async function getCart(): Promise<Cart | null> {
  const id = await cartId()
  if (!id) return null
  const res = await orNull(sdk.store.cart.retrieve(id, { fields: CART_FIELDS }, await auth()))
  if (!res || res.cart.completed_at) return null
  // API order is unstable; keep lines put while the buyer edits quantities.
  res.cart.items?.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  return res.cart
}

export const countOf = (cart: Pick<Cart, "items"> | null) => cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0

export async function getCustomer(): Promise<Customer | null> {
  if (!(await token())) return null
  return (await orNull(sdk.store.customer.retrieve({ fields: "*addresses" }, await auth())))?.customer ?? null
}
