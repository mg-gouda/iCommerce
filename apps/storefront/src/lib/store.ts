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
async function region() {
  // ponytail: single USD region (seed-defaults "Egypt"); region picker + EGP when checkout lands (P2).
  regionId ??= (await sdk.store.region.list({ limit: 1, fields: "id" })).regions[0]?.id
  return regionId
}

export async function listProducts(query: { limit?: number; category_id?: string[]; handle?: string } = {}) {
  await connection()
  const { products, count } = await sdk.store.product.list({
    ...query,
    region_id: await region(),
    fields: FIELDS,
    order: "-created_at",
  })
  return { products: products as unknown as Product[], count }
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
