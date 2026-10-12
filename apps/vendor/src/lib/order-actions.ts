"use server"

import { revalidatePath } from "next/cache"
import { api, ApiError } from "./api"
import type { FormState } from "./types"

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim()

async function call(path: string, body: unknown, values?: Record<string, string>, refresh = true): Promise<FormState> {
  try {
    await api(path, { method: "POST", body: JSON.stringify(body) })
  } catch (e) {
    if (e instanceof ApiError) return { values, message: e.status === 401 ? "expired" : e.message }
    throw e
  }
  if (refresh) revalidatePath("/[locale]/dashboard/orders", "layout")
  return { ok: true, values }
}

const orderPath = (id: string, action: string) => `/vendors/orders/${encodeURIComponent(id)}/${action}`

/** No revalidate: the ShipButton finishes its truck run first, then the client refreshes. */
export async function fulfillOrder(id: string, fd: FormData): Promise<FormState> {
  const values = { carrier: str(fd, "carrier"), tracking_number: str(fd, "tracking_number"), tracking_url: str(fd, "tracking_url") }
  const fieldErrors: Record<string, string> = {}
  if (!values.carrier) fieldErrors.carrier = "carrierRequired"
  if (!values.tracking_number) fieldErrors.tracking_number = "trackingRequired"
  if (values.tracking_url && !/^https?:\/\/\S+$/.test(values.tracking_url)) fieldErrors.tracking_url = "url"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  return call(orderPath(id, "fulfill"), { ...values, tracking_url: values.tracking_url || null }, values, false)
}

export async function deliverOrder(id: string): Promise<FormState> {
  return call(orderPath(id, "deliver"), {})
}

export async function cancelOrder(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const reason = str(fd, "reason")
  if (!reason) return { values: { reason }, fieldErrors: { reason: "reasonRequired" } }
  return call(orderPath(id, "cancel"), { reason }, { reason })
}

export async function decideReturn(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const note = str(fd, "note")
  return call(orderPath(id, "return-request"), { action: fd.get("action") === "approve" ? "approve" : "reject", note: note || null }, { note })
}

export async function createShippingOption(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { name: str(fd, "name"), kind: str(fd, "kind"), amount: str(fd, "amount"), free_over: str(fd, "free_over") }
  const kind = ["flat", "free_over", "pickup"].includes(values.kind) ? values.kind : "flat"
  const fieldErrors: Record<string, string> = {}
  if (!values.name) fieldErrors.name = "optionNameRequired"
  if (kind !== "pickup" && !(values.amount !== "" && Number(values.amount) >= 0)) fieldErrors.amount = "price"
  if (kind === "free_over" && !(Number(values.free_over) > 0)) fieldErrors.free_over = "freeOver"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  const body = {
    name: values.name,
    kind,
    ...(kind !== "pickup" && { amount: Number(values.amount) }),
    ...(kind === "free_over" && { free_over: Number(values.free_over) }),
  }
  try {
    await api("/vendors/shipping-options", { method: "POST", body: JSON.stringify(body) })
  } catch (e) {
    if (e instanceof ApiError) return { values, message: e.status === 401 ? "expired" : e.message }
    throw e
  }
  revalidatePath("/[locale]/dashboard/settings/shipping", "page")
  return { ok: true }
}

export async function deleteShippingOption(fd: FormData) {
  await api(`/vendors/shipping-options/${encodeURIComponent(String(fd.get("id")))}`, { method: "DELETE" })
  revalidatePath("/[locale]/dashboard/settings/shipping", "page")
}
