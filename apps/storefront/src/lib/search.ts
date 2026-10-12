import { connection } from "next/server"

// Meilisearch REST from the server with the search-only key (MEILI_SEARCH_KEY, never NEXT_PUBLIC). Index doc shape: p1-backend.md §5.
export type SearchDoc = {
  id: string
  title: string
  handle: string
  thumbnail: string | null
  vendor_name: string | null
  vendor_handle: string | null
  category_names: string[]
  unit: string | null
  b2b_only: boolean
  b2c_enabled: boolean
  price_min: number | null
  price_max: number | null
}

const quote = (v: string) => `"${v.replace(/["\\]/g, "\\$&")}"`

export async function searchProducts(o: { q?: string; category?: string; vendor?: string; limit?: number }) {
  await connection()
  const filter = [o.category && `category_names = ${quote(o.category)}`, o.vendor && `vendor_handle = ${quote(o.vendor)}`].filter(Boolean)
  const res = await fetch(`${process.env.MEILI_HOST ?? "http://localhost:7700"}/indexes/products/search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.MEILI_SEARCH_KEY ?? ""}` },
    body: JSON.stringify({ q: o.q ?? "", filter, facets: ["category_names"], limit: o.limit ?? 48 }),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`search failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return {
    hits: data.hits as SearchDoc[],
    total: (data.estimatedTotalHits ?? data.hits.length) as number,
    categories: (data.facetDistribution?.category_names ?? {}) as Record<string, number>,
  }
}
