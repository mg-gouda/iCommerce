import { connection } from "next/server"
import { sdk } from "@icommerce/sdk"

// Store API reads (server components only). Catalog changes must show up immediately → always dynamic.

export type Extra = {
  unit: string | null
  min_qty: number | null
  max_qty: number | null
  qty_step: number | null
  hs_code: string | null
  b2b_only: boolean
  b2c_enabled: boolean
  origin_country: string | null
}
export type StoreVendor = { name: string; handle: string; logo: string | null; city: string | null; country: string | null; status: string; kyc_status: string }
export type Product = {
  id: string
  title: string
  handle: string
  description: string | null
  thumbnail: string | null
  created_at: string
  metadata: Record<string, unknown> | null
  images: { id: string; url: string }[]
  categories: { id: string; name: string; handle: string }[]
  variants: { id: string; sku: string | null; calculated_price?: { calculated_amount: number; currency_code: string } }[]
  product_extra: Extra | null
  vendor: StoreVendor | null
}
export type Category = { id: string; name: string; handle: string }

const FIELDS = [
  "+metadata",
  "+created_at",
  "*categories",
  "*variants.calculated_price",
  ...["unit", "min_qty", "max_qty", "qty_step", "hs_code", "b2b_only", "b2c_enabled", "origin_country"].map((f) => `+product_extra.${f}`),
  ...["name", "handle", "logo", "city", "country", "status", "kyc_status"].map((f) => `+vendor.${f}`),
].join(",")

let regionId: string | undefined
export async function region() {
  // ponytail: single USD region (seed-defaults "Egypt", the only market we ship to); EGP prices + picker when a second region exists.
  regionId ??= (await sdk.store.region.list({ limit: 1, fields: "id" })).regions[0]?.id
  return regionId
}

export async function listProducts(query: { limit?: number; category_id?: string[]; handle?: string; id?: string[] } = {}) {
  await connection()
  const { products, count } = await sdk.store.product.list({
    ...query,
    region_id: await region(),
    fields: FIELDS,
    order: "-created_at",
  })
  // ponytail: suspended vendors' published products are dropped here, not in the API (count may overshoot by those).
  const live = (products as unknown as Product[]).filter((p) => !p.vendor || p.vendor.status === "approved")
  // Decimal columns (min/max/step) arrive as strings ("50", "2.5") → numbers once, here.
  for (const e of live.map((p) => p.product_extra)) {
    if (e) for (const k of ["min_qty", "max_qty", "qty_step"] as const) e[k] = e[k] == null ? null : Number(e[k])
  }
  return { products: live, count }
}

export async function getProduct(handle: string) {
  const { products } = await listProducts({ handle, limit: 1 })
  return products[0] ?? null
}

export async function listCategories() {
  await connection()
  const { product_categories } = await sdk.store.category.list({ limit: 100, fields: "id,name,handle" })
  return product_categories as Category[]
}

export async function getCategory(handle: string) {
  await connection()
  const { product_categories } = await sdk.store.category.list({ handle, fields: "id,name,handle" })
  return (product_categories[0] as Category | undefined) ?? null
}

export type PublicVendor = Pick<StoreVendor, "name" | "handle" | "logo" | "city" | "country" | "kyc_status"> & {
  banner: string | null
  description: string | null
}

export async function getVendor(handle: string) {
  await connection()
  try {
    const { vendor } = await sdk.client.fetch<{ vendor: PublicVendor }>(`/store/vendors/${encodeURIComponent(handle)}`)
    return vendor
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null
    throw e
  }
}

/** Retail buyers can add to cart; everything else is quote-only. */
export const isRetail = (e: Extra | null) => !e || (!e.b2b_only && e.b2c_enabled !== false)
export const isVerified = (v: Pick<StoreVendor, "kyc_status"> | null) => v?.kyc_status === "verified"
export const priceOf = (p: Product) => p.variants[0]?.calculated_price?.calculated_amount ?? null
export const compareAtOf = (p: Product) => {
  const c = Number(p.metadata?.compare_at_usd)
  return c > 0 ? c : undefined
}

/** Snaps a quantity onto the product's MOQ / step grid (integers only). Over max → throws. */
export function fitQty(qty: number, e: Pick<Extra, "min_qty" | "qty_step" | "max_qty"> | null) {
  const lo = e?.min_qty ?? 1
  const step = e?.qty_step ?? 1
  const fit = lo + Math.ceil((Math.max(lo, Math.floor(qty)) - lo) / step) * step
  if (e?.max_qty && fit > e.max_qty) throw new Error("qty")
  return fit
}

/** Products by id (vendor + MOQ facts for cart / order lines). Suspended vendors' products drop out. */
export async function productsById(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((i): i is string => !!i))]
  if (!unique.length) return new Map<string, Product>()
  const { products } = await listProducts({ id: unique, limit: unique.length })
  return new Map(products.map((p) => [p.id, p]))
}

/** Lines grouped by supplier, in first-seen order. Unknown vendor → handle "". */
export function byVendor<T extends { product_id?: string | null }>(items: T[], products: Map<string, Product>) {
  const groups = new Map<string, { vendor: StoreVendor | null; items: T[] }>()
  for (const it of items) {
    const v = products.get(it.product_id ?? "")?.vendor ?? null
    const key = v?.handle ?? ""
    if (!groups.has(key)) groups.set(key, { vendor: v, items: [] })
    groups.get(key)!.items.push(it)
  }
  return [...groups.values()]
}

/** Decimal MOQ/step (e.g. 2.5 t): Medusa line items are integers → quote-only. */
export const isFractional = (e: Pick<Extra, "min_qty" | "qty_step"> | null) =>
  !Number.isInteger(e?.min_qty ?? 1) || !Number.isInteger(e?.qty_step ?? 1)
