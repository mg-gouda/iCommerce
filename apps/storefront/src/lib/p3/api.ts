import { cache } from "react"
import { sdk } from "@icommerce/sdk"
import { auth, orNull, token } from "../session"
import type { Credit, Invitation, Member, Membership, Quote, QuoteStatus, Tier } from "./types"

// Adapter over the P3 store API (project_docs/api/p3-backend.md). Pages/actions call these, never paths directly.

type Init = { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> }

const BACKEND = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
// Dev only: typed fixtures stand in for the backend while it's being built. Never on in production builds.
const FIXTURES = process.env.NODE_ENV !== "production" && process.env.P3_FIXTURES === "1"

export async function call<T>(path: string, init: Init = {}): Promise<T> {
  const headers = await auth()
  if (FIXTURES) return (await import("./__dev__/fixtures")).fixture(path, init, headers.authorization) as T
  return sdk.client.fetch<T>(path, { method: init.method, body: init.body, query: init.query, headers })
}

/** Multipart POST (sdk JSON-encodes bodies). Returns status + parsed body. */
export async function upload(path: string, body: FormData): Promise<{ status: number; message?: string }> {
  const headers = await auth()
  if (FIXTURES) return (await import("./__dev__/fixtures")).fixtureUpload(path, body, headers.authorization)
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    body,
    headers: { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "", ...headers },
    cache: "no-store",
  })
  return { status: res.status, message: res.ok ? undefined : (await res.json().catch(() => ({}))).message }
}

/** Signed-in customer's company + own membership, or null (guest / no company). Once per request. */
export const getMembership = cache(async (): Promise<Membership | null> =>
  (await token()) ? orNull(call<Membership>("/store/companies/me")) : null
)

export const isVerified = (m: Membership | null) => m?.company.kyc_status === "verified"

export const getMembers = () => call<{ members: Member[]; invitations: Invitation[] }>("/store/companies/me/members")

export const getCredit = cache(() => call<Credit>("/store/companies/me/credit"))

/** Wholesale tiers (ascending), or null when the caller isn't a verified member. */
export async function getTiers(productId: string): Promise<Tier[] | null> {
  const r = await call<{ tiers: Tier[] | null }>(`/store/products/${encodeURIComponent(productId)}/wholesale-tiers`)
  return r.tiers?.map((t) => ({ min_qty: Number(t.min_qty), unit_price_usd: Number(t.unit_price_usd) })) ?? null
}

export const listQuotes = (q: { status?: QuoteStatus; rfq_id?: string; limit?: number } = {}) =>
  call<{ quotes: Quote[]; count: number }>("/store/quotes", { query: { limit: 50, ...q } })

export const getQuote = (id: string) => orNull(call<{ quote: Quote }>(`/store/quotes/${encodeURIComponent(id)}`))

/** Public vendor profile (id needed for free-text RFQ lines). */
export const vendorByHandle = (handle: string) =>
  orNull(sdk.client.fetch<{ vendor: { id: string; name: string; handle: string } }>(`/store/vendors/${encodeURIComponent(handle)}`))
