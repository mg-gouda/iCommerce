"use server"

import { revalidatePath } from "next/cache"
import { api, ApiError } from "./api"
import type { FormState, WholesaleTier } from "./types"

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim()
const PRICE = /^\d+(\.\d{1,2})?$/
const QTY = /^\d+(\.\d{1,3})?$/

async function post(path: string, body: unknown, values?: Record<string, string>, method = "POST"): Promise<FormState> {
  try {
    await api(path, { method, body: JSON.stringify(body) })
  } catch (e) {
    if (e instanceof ApiError) return { values, message: e.status === 401 ? "expired" : e.message }
    throw e
  }
  revalidatePath("/[locale]/dashboard/quotes", "layout")
  return { ok: true }
}
const quotePath = (id: string, action: string) => `/vendors/quotes/${encodeURIComponent(id)}/${action}`

/** Offer: unit price (+ optional lead time) per item, validity date, optional incoterm + note. */
export async function sendOffer(id: string, itemIds: string[], _prev: FormState, fd: FormData): Promise<FormState> {
  const values: Record<string, string> = { validity_until: str(fd, "validity_until"), incoterm: str(fd, "incoterm"), note: str(fd, "note") }
  const fieldErrors: Record<string, string> = {}
  for (const i of itemIds) {
    values[`price_${i}`] = str(fd, `price_${i}`)
    values[`lead_${i}`] = str(fd, `lead_${i}`)
    if (!PRICE.test(values[`price_${i}`])) fieldErrors[`price_${i}`] = "price"
    if (values[`lead_${i}`] && !/^\d{1,4}$/.test(values[`lead_${i}`])) fieldErrors[`lead_${i}`] = "leadTime"
  }
  const until = values.validity_until ? new Date(`${values.validity_until}T23:59:59Z`) : null
  if (!until || until <= new Date()) fieldErrors.validity_until = "validity"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  return post(
    quotePath(id, "offer"),
    {
      items: itemIds.map((i) => ({
        id: i,
        offered_unit_price: Number(values[`price_${i}`]),
        lead_time_days: values[`lead_${i}`] ? Number(values[`lead_${i}`]) : null,
      })),
      validity_until: until!.toISOString(),
      incoterm: values.incoterm || null,
      ...(values.note && { note: values.note }),
    },
    values,
  )
}

export async function rejectQuote(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const note = str(fd, "note")
  if (!note) return { values: { note }, fieldErrors: { note: "reasonRequiredQuote" } }
  return post(quotePath(id, "reject"), { note }, { note })
}

export async function sendQuoteMessage(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const body = str(fd, "body")
  if (!body) return { values: { body }, fieldErrors: { body: "messageRequired" } }
  return post(quotePath(id, "messages"), { body }, { body })
}

/** Rows arrive as min_qty[] / unit_price[]; empty rows are dropped. Errors keyed `row_<i>`. */
export async function saveTiers(productId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const mins = fd.getAll("min_qty").map((v) => String(v).trim())
  const prices = fd.getAll("unit_price").map((v) => String(v).trim())
  const values: Record<string, string> = {}
  const fieldErrors: Record<string, string> = {}
  const tiers: WholesaleTier[] = []
  mins.forEach((m, i) => {
    values[`min_${i}`] = m
    values[`price_${i}`] = prices[i] ?? ""
    if (!m && !prices[i]) return
    if (!(QTY.test(m) && Number(m) > 0)) fieldErrors[`min_${i}`] = "positiveQty"
    else if (!PRICE.test(prices[i] ?? "")) fieldErrors[`price_${i}`] = "price"
    else {
      const prev = tiers.at(-1)
      if (prev && Number(m) <= prev.min_qty) fieldErrors[`min_${i}`] = "tierAscending"
      else if (prev && Number(prices[i]) > prev.unit_price_usd) fieldErrors[`price_${i}`] = "tierPrice"
      tiers.push({ min_qty: Number(m), unit_price_usd: Number(prices[i]) })
    }
  })
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  const res = await post(`/vendors/products/${encodeURIComponent(productId)}/wholesale-tiers`, { tiers }, values, "PUT")
  if (res.ok) revalidatePath("/[locale]/dashboard/products/[id]", "page")
  return res
}
