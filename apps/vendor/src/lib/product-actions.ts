"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { api, ApiError, filesOf, routeLocale, uploadImages } from "./api"
import type { FormState, VendorProduct } from "./types"

const MB = 1024 * 1024
const TEXT = ["title", "description", "category_id", "price", "compare_at", "unit", "min_qty", "qty_step", "max_qty", "hs_code", "cost_price", "status"]
const INTS = ["min_qty", "qty_step", "max_qty"] as const

const num = (s: string) => (s === "" ? null : Number(s))

function validate(v: Record<string, string>, files: File[]) {
  const e: Record<string, string> = {}
  if (!v.title) e.title = "titleRequired"
  if (v.price === "" || !(Number(v.price) >= 0)) e.price = "price"
  if (v.compare_at !== "" && !(Number(v.compare_at) > Number(v.price))) e.compare_at = "compareAt"
  if (v.cost_price !== "" && !(Number(v.cost_price) >= 0)) e.cost_price = "costPrice"
  for (const k of INTS) if (v[k] !== "" && !(Number.isInteger(Number(v[k])) && Number(v[k]) > 0)) e[k] = "positiveInt"
  if (!e.max_qty && v.max_qty !== "" && v.min_qty !== "" && Number(v.max_qty) < Number(v.min_qty)) e.max_qty = "maxBelowMin"
  if (files.some((f) => !/^image\/(png|jpeg|webp|gif)$/.test(f.type))) e.images = "imageType"
  else if (files.some((f) => f.size > 5 * MB)) e.images = "imageSize"
  else if (files.length > 10) e.images = "imagesMax"
  return e
}

/** Create (`id` empty) or update a simple one-variant product. */
export async function saveProduct(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const v = Object.fromEntries(TEXT.map((k) => [k, String(fd.get(k) ?? "").trim()]))
  const values = { ...v, b2b_only: fd.get("b2b_only") ? "on" : "", b2c_enabled: fd.get("b2c_enabled") ? "on" : "" }
  const files = filesOf(fd, "images")
  const fieldErrors = validate(v, files)
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }

  try {
    const existing = id ? (await api<{ product: VendorProduct }>(`/vendors/products/${id}`)).product : null
    const kept = fd.getAll("keep_image").map(String)
    const images = [...kept, ...(await uploadImages(files))].map((url) => ({ url }))
    const price = { currency_code: "usd", amount: Number(v.price) }
    const body = {
      title: v.title,
      description: v.description || null,
      status: v.status === "published" ? "published" : "draft",
      images,
      thumbnail: images[0]?.url ?? null,
      categories: v.category_id ? [{ id: v.category_id }] : [],
      metadata: { ...existing?.metadata, compare_at_usd: num(v.compare_at) },
      extra: {
        unit: v.unit || null,
        min_qty: num(v.min_qty),
        qty_step: num(v.qty_step),
        max_qty: num(v.max_qty),
        hs_code: v.hs_code || null,
        cost_price: num(v.cost_price),
        b2b_only: !!fd.get("b2b_only"),
        b2c_enabled: !!fd.get("b2c_enabled"),
      },
      ...(existing
        ? { variants: [{ id: existing.variants[0].id, prices: [price] }] }
        : {
            options: [{ title: "Default", values: ["Default"] }],
            variants: [{ title: "Default", options: { Default: "Default" }, prices: [price], manage_inventory: false }],
          }),
    }
    await api(existing ? `/vendors/products/${id}` : "/vendors/products", { method: "POST", body: JSON.stringify(body) })
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    if (/handle/i.test(e.message) && /exists/i.test(e.message)) return { values, fieldErrors: { title: "handleTaken" } }
    return { values, message: e.status === 401 ? "expired" : e.message }
  }
  revalidatePath("/[locale]/dashboard/products", "layout")
  if (!id) redirect(`/${routeLocale(fd)}/dashboard/products?saved=1`)
  return { ok: true, values }
}

export async function deleteProduct(fd: FormData) {
  await api(`/vendors/products/${fd.get("id")}`, { method: "DELETE" })
  revalidatePath("/[locale]/dashboard/products", "layout")
}

export type ImportResult = FormState & {
  created?: { row: number; handle: string }[]
  errors?: { row: number; handle?: string | null; errors: string[] }[]
}

export async function importCsv(_prev: ImportResult, fd: FormData): Promise<ImportResult> {
  const [file] = filesOf(fd, "file")
  if (!file) return { fieldErrors: { file: "csvRequired" } }
  if (file.size > 5 * MB) return { fieldErrors: { file: "csvSize" } }
  const body = new FormData()
  body.append("file", file, file.name)
  body.append("status", fd.get("status") === "published" ? "published" : "draft")
  try {
    const res = await api<Required<Pick<ImportResult, "created" | "errors">>>("/vendors/products/import", { method: "POST", body })
    revalidatePath("/[locale]/dashboard/products", "layout")
    return { ok: true, ...res }
  } catch (e) {
    if (e instanceof ApiError) return { message: e.status === 401 ? "expired" : e.message }
    throw e
  }
}
