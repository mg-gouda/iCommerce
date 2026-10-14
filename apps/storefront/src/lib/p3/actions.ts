"use server"

import { cookies } from "next/headers"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { sdk } from "@icommerce/sdk"
import { EMAIL, routeLocale, str, type FormState } from "../forms"
import { auth, cartId, status, token } from "../session"
import { call, upload, vendorByHandle } from "./api"
import { cartSalesChannel, MODE_COOKIE, rfqDraft, saveDraft } from "./mode"
import { ROLES, type Role } from "./types"

const go = (fd: FormData, path: string): never => redirect(`/${routeLocale(fd)}${path}`)
// Guests sign in first and land on the review page (the draft cookie survives sign-in).
const rfqPath = async () => ((await token()) ? "/account/rfq" : "/login?next=/account/rfq")

/** Runs an API call; a 4xx becomes the form message (backend messages are plain English sentences). */
async function attempt(fn: () => Promise<unknown>, values?: Record<string, string>): Promise<FormState | null> {
  try {
    await fn()
    return null
  } catch (e) {
    const s = status(e) ?? 500
    if (s >= 500) throw e
    return { values, message: s === 403 ? "notAllowed" : (e as Error).message }
  }
}

/** Header Retail / Wholesale switch. An open cart follows the mode's sales channel (prices recompute). */
export async function setMode(fd: FormData) {
  ;(await cookies()).set(MODE_COOKIE, str(fd, "mode") === "wholesale" ? "wholesale" : "retail", { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 })
  const id = await cartId()
  const channel = await cartSalesChannel()
  if (id && channel) await sdk.store.cart.update(id, { sales_channel_id: channel }, { fields: "id" }, await auth()).catch(() => {})
  refresh()
}

// ── Company ────────────────────────────────────────────────────────────────

const qty3 = (n: number) => Number.isFinite(n) && n > 0 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6

export async function createCompany(_: FormState, fd: FormData): Promise<FormState> {
  const values = Object.fromEntries(["name", "country", "city", "address", "phone"].map((k) => [k, str(fd, k)]))
  const fieldErrors: Record<string, string> = {}
  for (const k of ["name", "country", "city", "address", "phone"]) if (!values[k]) fieldErrors[k] = "required"
  if (values.country && !/^[A-Z]{2}$/.test(values.country)) fieldErrors.country = "country"
  if (values.phone && !/^\+?[\d\s()-]{7,20}$/.test(values.phone)) fieldErrors.phone = "phoneIntl"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  const err = await attempt(() => call("/store/companies", { method: "POST", body: values }), values)
  return err ?? go(fd, "/account/company")
}

const KYC_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"]

export async function submitKyc(_: FormState, fd: FormData): Promise<FormState> {
  const values = { tax_id: str(fd, "tax_id"), commercial_reg_no: str(fd, "commercial_reg_no"), export_card_no: str(fd, "export_card_no") }
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  const fieldErrors: Record<string, string> = {}
  if (!values.tax_id) fieldErrors.tax_id = "required"
  if (!values.commercial_reg_no) fieldErrors.commercial_reg_no = "required"
  if (!files.length) fieldErrors.files = "kycFiles"
  else if (files.length > 10 || files.some((f) => f.size > 10 * 1024 * 1024 || !KYC_TYPES.includes(f.type))) fieldErrors.files = "kycFileRules"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  const body = new FormData()
  for (const [k, v] of Object.entries(values)) if (v) body.append(k, v)
  for (const f of files) body.append("files", f)
  const res = await upload("/store/companies/me/kyc", body)
  if (res.status >= 400) return { values, message: res.message ?? "kycFailed" }
  refresh()
  return { ok: true }
}

export async function invite(_: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email"), role: str(fd, "role") }
  if (!EMAIL.test(values.email)) return { values, fieldErrors: { email: "email" } }
  if (!ROLES.includes(values.role as Role)) return { values, fieldErrors: { role: "required" } }
  const err = await attempt(() => call("/store/companies/me/invitations", { method: "POST", body: values }), values)
  if (err) return err
  refresh()
  return { ok: true }
}

export async function setRole(_: FormState, fd: FormData): Promise<FormState> {
  const role = str(fd, "role")
  if (!ROLES.includes(role as Role)) return {}
  const err = await attempt(() => call(`/store/companies/me/members/${encodeURIComponent(str(fd, "id"))}`, { method: "POST", body: { role } }))
  if (err) return err
  refresh()
  return { ok: true }
}

export async function removeMember(_: FormState, fd: FormData): Promise<FormState> {
  const err = await attempt(() => call(`/store/companies/me/members/${encodeURIComponent(str(fd, "id"))}`, { method: "DELETE" }))
  if (err) return err
  refresh()
  return { ok: true }
}

export async function acceptInvite(_: FormState, fd: FormData): Promise<FormState> {
  const err = await attempt(() => call("/store/companies/invitations/accept", { method: "POST", body: { token: str(fd, "token") } }))
  return err ?? go(fd, "/account/company")
}

// ── RFQ draft ──────────────────────────────────────────────────────────────

/** Product page "Request quote": adds/updates the product's line, then opens the review page. */
export async function addToRfq(fd: FormData) {
  const product_id = str(fd, "product_id")
  const quantity = Number(fd.get("quantity"))
  const items = (await rfqDraft()).filter((i) => i.product_id !== product_id)
  await saveDraft([...items, { product_id, quantity: qty3(quantity) ? quantity : 1 }])
  go(fd, await rfqPath())
}

/** Home "Post a request for quotation": free-text line; suppliers are picked on the review page. */
export async function addFreeText(_: FormState, fd: FormData): Promise<FormState> {
  const values = { title: str(fd, "title"), quantity: str(fd, "quantity"), unit: str(fd, "unit") }
  const fieldErrors: Record<string, string> = {}
  if (!values.title) fieldErrors.title = "required"
  if (!qty3(Number(values.quantity))) fieldErrors.quantity = "qtyDecimal"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  await saveDraft([...(await rfqDraft()), { title: values.title, quantity: Number(values.quantity), unit: values.unit || undefined }])
  return go(fd, await rfqPath())
}

export async function removeDraftLine(fd: FormData) {
  const i = Number(fd.get("i"))
  await saveDraft((await rfqDraft()).filter((_, k) => k !== i))
  refresh()
}

/**
 * Review page submit → POST /store/quotes (one quote per vendor). Free-text lines go to every ticked supplier
 * (`vendor_<i>` = vendor handles, resolved to ids here) and/or to iCommerce staff (`find_<i>` → `find_suppliers`).
 */
export async function submitRfq(_: FormState, fd: FormData): Promise<FormState> {
  const draft = await rfqDraft()
  const values: Record<string, string> = { notes: str(fd, "notes"), incoterm: str(fd, "incoterm") }
  const fieldErrors: Record<string, string> = {}
  const items: Record<string, unknown>[] = []
  for (const [i, d] of draft.entries()) {
    const q = str(fd, `qty_${i}`)
    const target = str(fd, `target_${i}`)
    values[`qty_${i}`] = q
    values[`target_${i}`] = target
    if (!qty3(Number(q))) fieldErrors[`qty_${i}`] = "qtyDecimal"
    if (target && !(Number(target) >= 0)) fieldErrors[`target_${i}`] = "price"
    const line = { quantity: Number(q), ...(target ? { target_price: Number(target) } : {}) }
    if (d.product_id) items.push({ product_id: d.product_id, ...line })
    else {
      const handles = fd.getAll(`vendor_${i}`).map(String)
      const find = fd.get(`find_${i}`) === "1"
      values[`vendor_${i}`] = handles.join(",")
      values[`find_${i}`] = find ? "1" : ""
      if (!handles.length && !find) fieldErrors[`vendor_${i}`] = "pickSupplier"
      if (find) items.push({ title: d.title, unit: d.unit, find_suppliers: true, ...line })
      for (const h of handles) {
        const v = await vendorByHandle(h)
        if (v) items.push({ title: d.title, unit: d.unit, vendor_id: v.vendor.id, ...line })
      }
    }
  }
  if (!draft.length) return { message: "rfqEmpty" }
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  let rfq = ""
  const err = await attempt(async () => {
    const res = await call<{ rfq_id: string }>("/store/quotes", {
      method: "POST",
      body: { items, notes: values.notes || undefined, incoterm: values.incoterm || undefined },
    })
    rfq = res.rfq_id
  }, values)
  if (err) return err
  await saveDraft([])
  return go(fd, `/account/quotes?rfq=${encodeURIComponent(rfq)}`)
}

// ── Quotes ─────────────────────────────────────────────────────────────────

const quotePath = (fd: FormData, action: string) => `/store/quotes/${encodeURIComponent(str(fd, "quote"))}/${action}`

async function quoteAction(fd: FormData, action: string, body: Record<string, unknown> = {}, values?: Record<string, string>): Promise<FormState> {
  const err = await attempt(() => call(quotePath(fd, action), { method: "POST", body }), values)
  if (err) return err
  refresh()
  return { ok: true }
}

export async function sendMessage(_: FormState, fd: FormData): Promise<FormState> {
  const body = str(fd, "body")
  if (!body) return { fieldErrors: { body: "required" } }
  return quoteAction(fd, "messages", { body })
}

export async function counter(_: FormState, fd: FormData): Promise<FormState> {
  const message = str(fd, "message")
  const values: Record<string, string> = { message }
  const fieldErrors: Record<string, string> = {}
  const items: { id: string; target_price: number }[] = []
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("target_") || !String(v).trim()) continue
    values[k] = String(v)
    if (!(Number(v) >= 0)) fieldErrors[k] = "price"
    else items.push({ id: k.slice(7), target_price: Number(v) })
  }
  if (!message) fieldErrors.message = "required"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  return quoteAction(fd, "counter", { message, items }, values)
}

export const acceptQuote = async (_: FormState, fd: FormData) => quoteAction(fd, "accept")
export const approveQuote = async (_: FormState, fd: FormData) => quoteAction(fd, "approve")
export const rejectQuote = async (_: FormState, fd: FormData) => quoteAction(fd, "reject", { reason: str(fd, "reason") || undefined })
