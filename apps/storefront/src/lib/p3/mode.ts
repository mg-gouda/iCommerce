import { cookies } from "next/headers"
import { getMembership, isVerified } from "./api"
import type { DraftItem } from "./types"

export const MODE_COOKIE = "ic_mode"
export const RFQ_COOKIE = "ic_rfq"
export type Mode = "retail" | "wholesale"

/**
 * Buying mode from the header switch. Verified company members default to wholesale; everyone else to retail.
 * `wholesale` = the buyer actually gets wholesale prices + a Wholesale cart (picked mode AND verified member).
 */
export async function buyingMode() {
  const [jar, membership] = await Promise.all([cookies(), getMembership()])
  const verified = isVerified(membership)
  const picked = jar.get(MODE_COOKIE)?.value
  const mode: Mode = picked === "wholesale" || picked === "retail" ? picked : verified ? "wholesale" : "retail"
  return { mode, wholesale: mode === "wholesale" && verified, verified, membership }
}

/**
 * Sales channel for new / switched carts (the Storefront key spans both, so Medusa needs it explicitly):
 * Wholesale (tier prices + MOQ checks; 403 for non-verified callers) for verified members in wholesale mode, else Retail.
 */
export async function cartSalesChannel() {
  const key = (await buyingMode()).wholesale ? "WHOLESALE_SALES_CHANNEL_ID" : "RETAIL_SALES_CHANNEL_ID"
  const id = process.env[key]
  if (!id) throw new Error(`${key} is not set (sales_channel id from seed-defaults)`)
  return id
}

/** RFQ draft (cookie, JSON). ponytail: cookie caps it at ~4 KB ≈ 30 lines; server-side drafts if buyers need more. */
export async function rfqDraft(): Promise<DraftItem[]> {
  try {
    const v = JSON.parse((await cookies()).get(RFQ_COOKIE)?.value ?? "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export async function saveDraft(items: DraftItem[]) {
  const jar = await cookies()
  if (!items.length) return jar.delete(RFQ_COOKIE)
  jar.set(RFQ_COOKIE, JSON.stringify(items), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 })
}
