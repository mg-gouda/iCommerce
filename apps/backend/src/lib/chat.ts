import { createHmac } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import VendorProductLink from "../links/vendor-product"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { companySvc } from "./company"
import { getQuoteOr404, quoteRef } from "./quotes"
import { parentPayments, vendorOrderLinks } from "./vendor-orders"

// P5b: TalkJS chat (project_docs/api/p5b-chat.md). We own who-talks-to-whom: conversations + tokens are made here only.

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export type Kind = "product" | "order" | "quote"
export type Caller = { customer_id: string } | { vendor_id: string }

/** Non-Medusa statuses (502/503) with a `type` the clients branch on. */
export class ChatError extends Error {
  constructor(public status: number, public type: "chat_disabled" | "chat_upstream", message: string) {
    super(message)
  }
}

const cfg = () => {
  const app = process.env.TALKJS_APP_ID
  const secret = process.env.TALKJS_SECRET_KEY
  if (!app || !secret) throw new ChatError(503, "chat_disabled", "Chat is not configured.")
  return { app, secret, url: process.env.TALKJS_API_URL || "https://api.talkjs.com" }
}

/** Route wrapper: chat errors → `{ type, message }` with their status; everything else → Medusa's handler. */
export const chatRoute =
  <R extends AuthenticatedMedusaRequest>(fn: (req: R, res: MedusaResponse) => Promise<unknown>) =>
  async (req: R, res: MedusaResponse) => {
    try {
      cfg()
      res.json(await fn(req, res))
    } catch (e) {
      if (!(e instanceof ChatError)) throw e
      res.status(e.status).json({ type: e.type, message: e.message })
    }
  }

/** TalkJS REST call (secret = bearer). Any failure → 502 chat_upstream (the upstream body never reaches clients). */
export async function talk<T = Row>(path: string, init: { method?: "GET" | "PUT"; body?: unknown } = {}): Promise<T> {
  const { app, secret, url } = cfg()
  const res = await fetch(`${url}/v1/${app}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }).catch(() => null)
  if (!res?.ok) throw new ChatError(502, "chat_upstream", "Chat service unavailable.")
  return (await res.json().catch(() => ({}))) as T
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")

/** Session for one TalkJS user: HS256 JWT `{ tokenType: "user", iss, sub, exp: +1h }`. */
export function session(user_id: string) {
  const { app, secret } = cfg()
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ tokenType: "user", iss: app, sub: user_id, exp: Math.floor(Date.now() / 1000) + 3600 })}`
  return { app_id: app, user_id, token: `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}` }
}

export const LOCALES = ["en", "ar"] as const
// `lang`, not `locale`: Medusa strips `?locale=` from req.query (its own translation middleware).
export const Locale = z.object({ lang: z.enum(LOCALES).optional() })
export const OpenBody = Locale.extend({ kind: z.enum(["product", "order", "quote"]), ref_id: z.string().min(1).max(200) }).strict()

const userId = (c: Caller) => ("customer_id" in c ? `c_${c.customer_id}` : `v_${c.vendor_id}`)

/** Upserts a buyer. `locale`: given → page locale, undefined → profile locale, null → leave TalkJS's as is (other party). */
async function putCustomer(scope: MedusaContainer, customer_id: string, locale?: string | null) {
  const [c] = await scope.resolve(Modules.CUSTOMER).listCustomers({ id: customer_id }, { select: ["id", "email", "first_name", "last_name", "metadata"] })
  if (!c) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer not found")
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email
  const fallback = LOCALES.includes(c.metadata?.locale as never) ? (c.metadata!.locale as string) : "en"
  await talk(`/users/c_${c.id}`, { method: "PUT", body: { name, email: [c.email], role: "buyer", ...(locale !== null && { locale: locale ?? fallback }) } })
}

async function putVendor(scope: MedusaContainer, vendor_id: string, locale?: string | null) {
  const v = await scope.resolve<VendorModuleService>(VENDOR_MODULE).retrieveVendor(vendor_id, { relations: ["users"] })
  const email = v.email ?? v.users?.find((u) => u.role === "owner")?.email
  await talk(`/users/v_${v.id}`, {
    method: "PUT",
    body: { name: v.name, email: email ? [email] : null, role: "vendor", photoUrl: v.logo ?? null, ...(locale !== null && { locale: locale ?? "en" }) },
  })
}

export async function putOps() {
  const email = process.env.ADMIN_NOTIFY_EMAIL
  await talk("/users/ops", { method: "PUT", body: { name: "iCommerce Support", email: email ? [email] : null, role: "ops", locale: "en" } })
}

/** Upserts the caller's TalkJS user (UI locale = page locale when given) → session. */
export async function callerSession(scope: MedusaContainer, caller: Caller, locale?: string) {
  if ("customer_id" in caller) await putCustomer(scope, caller.customer_id, locale)
  else await putVendor(scope, caller.vendor_id, locale)
  return session(userId(caller))
}

const notFound = (kind: Kind, id: string): never => {
  throw new MedusaError(MedusaError.Types.NOT_FOUND, `${kind} "${id}" not found`)
}
const query = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.QUERY)

/**
 * Who may open what (§2). Anything not allowed is the same 404 as a missing ref.
 * Returns the conversation to upsert: id, the buyer + vendor it is between, subject, photo.
 */
async function resolveConversation(scope: MedusaContainer, caller: Caller, kind: Kind, ref_id: string) {
  const me = "customer_id" in caller ? caller.customer_id : null
  if (kind === "product") {
    if (!me) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Vendors can't start product chats.")
    const { data: [p] } = await query(scope).graph({ entity: "product", fields: ["id", "title", "status", "thumbnail"], filters: { id: ref_id } })
    const { data: [link] } = await query(scope).graph({ entity: VendorProductLink.entryPoint, fields: ["vendor_id"], filters: { product_id: ref_id } })
    if (p?.status !== "published" || !link) return notFound(kind, ref_id)
    return { id: `prd_${p.id}_${me}`, customer_id: me, vendor_id: link.vendor_id as string, subject: p.title as string, photoUrl: (p.thumbnail as string) ?? null }
  }
  if (kind === "order") {
    const [link] = await vendorOrderLinks(scope, { order_id: ref_id })
    const { data: [o] } = link ? await query(scope).graph({ entity: "order", fields: ["id", "metadata"], filters: { id: ref_id } }) : { data: [] }
    const parent = o?.metadata?.parent_order_id ? (await parentPayments(scope, [o.metadata.parent_order_id])).get(o.metadata.parent_order_id) : null
    if (!link || !parent || (me ? parent.customer_id !== me : link.vendor_id !== (caller as { vendor_id: string }).vendor_id)) return notFound(kind, ref_id)
    return { id: `ord_${ref_id}`, customer_id: parent.customer_id as string, vendor_id: link.vendor_id, subject: `Order #${parent.display_id}`, photoUrl: null }
  }
  const q = await getQuoteOr404(scope, ref_id, {})
  let allowed = !!q.vendor_id && (me ? q.customer_id === me : q.vendor_id === (caller as { vendor_id: string }).vendor_id)
  if (q.vendor_id && me && !allowed) {
    const [m] = await companySvc(scope).listCompanyMembers({ company_id: q.company_id, customer_id: me })
    allowed = m?.role === "admin" || m?.role === "approver"
  }
  if (!allowed) return notFound(kind, ref_id)
  return { id: `qt_${q.id}`, customer_id: q.customer_id as string, vendor_id: q.vendor_id as string, subject: `Quote ${quoteRef(q)}`, photoUrl: null }
}

/** Checks access, upserts users + conversation (caller joins: company approvers on first open), returns caller session + id. */
export async function openConversation(scope: MedusaContainer, caller: Caller, kind: Kind, ref_id: string, locale?: string) {
  const c = await resolveConversation(scope, caller, kind, ref_id)
  const s = await callerSession(scope, caller, locale)
  // Other party: upserted without a locale (keeps whatever they chose).
  if ("customer_id" in caller) await putVendor(scope, c.vendor_id, null)
  if (!("customer_id" in caller) || caller.customer_id !== c.customer_id) await putCustomer(scope, c.customer_id, null)
  const participants = [...new Set([`c_${c.customer_id}`, `v_${c.vendor_id}`, s.user_id])]
  await talk(`/conversations/${c.id}`, {
    method: "PUT",
    body: {
      participants,
      subject: c.subject,
      custom: { kind, ref_id, vendor_id: c.vendor_id, customer_id: c.customer_id },
      ...(c.photoUrl && { photoUrl: c.photoUrl }),
    },
  })
  return { ...s, conversation_id: c.id }
}

/** Unread conversations of one TalkJS user. ponytail: counts the first 100 (badge shows "99+" past that anyway). */
export async function unread(user_id: string) {
  const r = await talk<{ data?: unknown[] }>(`/users/${user_id}/conversations?unreadsOnly=true&limit=100`)
  return { count: r.data?.length ?? 0 }
}
