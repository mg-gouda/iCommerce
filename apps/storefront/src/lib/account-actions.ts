"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { sdk } from "@icommerce/sdk"
import { EMAIL, parseAddress, routeLocale, str, type FormState } from "./forms"
import { auth, CART_COOKIE, cartId, clearCookie, setCookie, status, TOKEN_COOKIE } from "./session"

const BACKEND = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

const post = <T>(path: string, body: Record<string, unknown>, token?: string) =>
  sdk.client.fetch<T>(path, { method: "POST", body, headers: token ? { authorization: `Bearer ${token}` } : {} })

const login = async (email: string, password: string) =>
  (await post<{ token: string }>("/auth/customer/emailpass", { email, password })).token

// A token for an identity with no customer actor (e.g. a vendor login) carries an empty actor_id.
const hasActor = (token: string) => !!JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).actor_id

/** Only same-site paths survive `?next=` (no `//evil.com`). */
const nextPath = (fd: FormData) => {
  const n = str(fd, "next")
  return /^\/(?!\/)/.test(n) ? n : "/account"
}

async function startSession(token: string) {
  await setCookie(TOKEN_COOKIE, token)
  // A guest cart becomes the customer's cart (keeps items picked before signing in).
  const id = await cartId()
  if (id) await sdk.store.cart.transferCart(id, { fields: "id" }, { authorization: `Bearer ${token}` }).catch(() => clearCookie(CART_COOKIE))
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email")
  const password = String(fd.get("password") ?? "")
  const values = { email }
  if (!EMAIL.test(email)) return { values, fieldErrors: { email: "email" } }
  if (!password) return { values, fieldErrors: { password: "required" } }
  let token: string
  try {
    token = await login(email, password)
  } catch (e) {
    if (status(e) === 401) return { values, message: "badLogin" }
    throw e
  }
  if (!hasActor(token)) return { values, message: "noAccount" }
  await startSession(token)
  redirect(`/${routeLocale(fd)}${nextPath(fd)}`)
}

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const values = { first_name: str(fd, "first_name"), last_name: str(fd, "last_name"), email: str(fd, "email") }
  const password = String(fd.get("password") ?? "")
  const fieldErrors: Record<string, string> = {}
  if (!values.first_name) fieldErrors.first_name = "required"
  if (!values.last_name) fieldErrors.last_name = "required"
  if (!EMAIL.test(values.email)) fieldErrors.email = "email"
  if (password.length < 8) fieldErrors.password = "passwordShort"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }

  let token: string
  try {
    token = (await post<{ token: string }>("/auth/customer/emailpass/register", { email: values.email, password })).token
  } catch (e) {
    // Identity exists (vendor/admin with the same email, or a half-finished sign-up): its login token can still register.
    if (status(e) !== 401) throw e
    try {
      token = await login(values.email, password)
    } catch {
      return { values, fieldErrors: { email: "emailTaken" } }
    }
    if (hasActor(token)) return { values, fieldErrors: { email: "emailTaken" } }
  }
  // metadata.locale picks the email language (p2-backend.md §1).
  await post("/store/customers", { ...values, metadata: { locale: routeLocale(fd) } }, token)
  // Registration token has no actor yet; log in again for one that carries the new customer.
  await startSession(await login(values.email, password))
  redirect(`/${routeLocale(fd)}${nextPath(fd)}`)
}

export async function signOut(fd: FormData) {
  await clearCookie(TOKEN_COOKIE)
  // The cart belonged to the customer; a signed-out browser starts a fresh one.
  await clearCookie(CART_COOKIE)
  redirect(`/${routeLocale(fd)}`)
}

export async function addAddress(_: FormState, fd: FormData): Promise<FormState> {
  const { values, fieldErrors, address } = parseAddress(fd)
  if (!address) return { values, fieldErrors }
  await sdk.store.customer.createAddress(address, { fields: "id" }, await auth())
  refresh()
  return { ok: true }
}

export async function deleteAddress(fd: FormData) {
  await sdk.store.customer.deleteAddress(str(fd, "id"), await auth())
  refresh()
}

/** Multipart passthrough: sdk.client.fetch JSON-encodes bodies, so plain fetch here. */
async function upload(path: string, body: FormData): Promise<number> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    body,
    headers: { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "", ...(await auth()) },
    cache: "no-store",
  })
  return res.status
}

/** Bank-transfer proof → POST /store/orders/:id/payment-proof (multipart `file`, own orders; p2-backend.md §4). */
export async function uploadProof(_: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("file")
  if (!(file instanceof File) || !file.size) return { fieldErrors: { file: "fileRequired" } }
  if (file.size > 10 * 1024 * 1024) return { fieldErrors: { file: "fileTooBig" } }
  const body = new FormData()
  body.append("file", file)
  const code = await upload(`/store/orders/${encodeURIComponent(str(fd, "order"))}/payment-proof`, body)
  if (code === 404) return { message: "proofNotReady" }
  if (code >= 400) return { message: "proofFailed" }
  refresh()
  return { ok: true }
}

/** Return request → POST /store/orders/:id/return-request { reason, items: [{ item_id, quantity }] } (parent line ids; p2-backend.md §4). */
export async function requestReturn(_: FormState, fd: FormData): Promise<FormState> {
  const items = [...fd.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
    .map(([k, v]) => ({ item_id: k.slice(4), quantity: Math.floor(Number(v)) }))
  const reason = str(fd, "reason")
  const values = { reason }
  if (!items.length) return { values, fieldErrors: { items: "pickItems" } }
  if (!reason) return { values, fieldErrors: { reason: "required" } }
  try {
    await sdk.client.fetch(`/store/orders/${encodeURIComponent(str(fd, "order"))}/return-request`, {
      method: "POST",
      body: { items, reason },
      headers: await auth(),
    })
  } catch (e) {
    return { values, message: status(e) === 404 ? "returnNotReady" : (e as Error).message }
  }
  refresh()
  return { ok: true }
}
