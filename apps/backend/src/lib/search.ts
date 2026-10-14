import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { hiddenVendorIds } from "./plans"

// MEILI_INDEX lets parallel envs (e.g. a migration dry-run) share one Meili server.
export const PRODUCTS_INDEX = process.env.MEILI_INDEX || "products"

const FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "status",
  "thumbnail",
  "categories.name",
  "variants.prices.amount",
  "variants.prices.currency_code",
  "vendor.id",
  "vendor.name",
  "vendor.handle",
  "product_extra.*",
]

type Product = {
  id: string
  title: string
  handle: string
  description: string | null
  status: string
  thumbnail: string | null
  categories?: { name: string }[]
  variants?: { prices?: { amount: number; currency_code: string }[] }[]
  vendor?: { id: string; name: string; handle: string } | null
  product_extra?: Record<string, unknown> | null
}

// meilisearch is ESM-only → lazy import. Unset MEILI_HOST (tests, CI) = search disabled, no-op.
async function index() {
  if (!process.env.MEILI_HOST) return null
  const { Meilisearch } = await import("meilisearch")
  return new Meilisearch({ host: process.env.MEILI_HOST, apiKey: process.env.MEILI_KEY }).index(PRODUCTS_INDEX)
}

export function toDoc(p: Product) {
  const usd = (p.variants ?? []).flatMap((v) => v.prices ?? []).filter((x) => x.currency_code === "usd")
  const amounts = usd.map((x) => Number(x.amount))
  const e = p.product_extra ?? {}
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description,
    thumbnail: p.thumbnail,
    vendor_name: p.vendor?.name ?? null,
    vendor_handle: p.vendor?.handle ?? null,
    category_names: (p.categories ?? []).map((c) => c.name),
    hs_code: e.hs_code ?? null,
    unit: e.unit ?? null,
    origin_country: e.origin_country ?? null,
    b2b_only: e.b2b_only ?? false,
    b2c_enabled: e.b2c_enabled ?? true,
    price_min: amounts.length ? Math.min(...amounts) : null,
    price_max: amounts.length ? Math.max(...amounts) : null,
  }
}

async function fetchProducts(container: MedusaContainer, filters: Record<string, unknown>, skip = 0, take = 500) {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: FIELDS,
    filters,
    pagination: { skip, take },
  })
  return data as unknown as Product[]
}

// Only published products are searchable; anything else is removed from the index.
// ponytail: vendor/category renames do not reindex; run sync-search or wait for the next product change.
export async function syncProduct(container: MedusaContainer, id: string) {
  const idx = await index()
  if (!idx) return
  const [p] = await fetchProducts(container, { id })
  // P4: vendors past due beyond the grace period are de-indexed (back on the next sync after payment).
  if (p?.status === "published" && !(p.vendor && (await hiddenVendorIds(container)).includes(p.vendor.id))) await idx.addDocuments([toDoc(p)], { primaryKey: "id" })
  else await idx.deleteDocument(id)
}

export async function removeProduct(id: string) {
  const idx = await index()
  if (idx) await idx.deleteDocument(id)
}

export async function reindexAll(container: MedusaContainer) {
  const idx = await index()
  if (!idx) throw new Error("MEILI_HOST not set")
  await idx
    .updateSettings({
      searchableAttributes: ["title", "description", "vendor_name", "category_names", "hs_code"],
      filterableAttributes: ["vendor_handle", "category_names", "unit", "origin_country", "b2b_only", "b2c_enabled", "price_min", "price_max"],
      sortableAttributes: ["price_min", "price_max"],
    })
    .waitTask()
  await idx.deleteAllDocuments().waitTask()
  const hidden = await hiddenVendorIds(container)
  let total = 0
  for (let skip = 0; ; skip += 500) {
    const batch = await fetchProducts(container, { status: "published" }, skip)
    if (!batch.length) break
    await idx.addDocuments(batch.filter((p) => !hidden.includes(p.vendor?.id ?? "")).map(toDoc), { primaryKey: "id" }).waitTask()
    total += batch.length
  }
  return total
}
