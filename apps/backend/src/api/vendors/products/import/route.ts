import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules, toHandle } from "@medusajs/framework/utils"
import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import { parse } from "csv-parse/sync"
import { createVendorProductWorkflow } from "../../../../workflows/vendor-products"
import { gateStatus, getCaller } from "../../helpers"
import { salesChannelsFor } from "../helpers"

const MAX_ROWS = 1000
type Row = Record<string, string | undefined>

const num = (v?: string) => (v ? Number(v) : undefined)
const bool = (v?: string) => (v ? /^(1|true|yes|y)$/i.test(v) : undefined)

function rowErrors(r: Row) {
  const errs: string[] = []
  if (!r.title) errs.push("title is required")
  if (!r.price_usd || !(Number(r.price_usd) >= 0)) errs.push("price_usd must be a number >= 0")
  if (r.compare_at_usd && !(Number(r.compare_at_usd) >= 0)) errs.push("compare_at_usd must be a number >= 0")
  for (const k of ["min_qty", "qty_step"] as const) {
    if (r[k] && !(Number.isInteger(Number(r[k])) && Number(r[k]) > 0)) errs.push(`${k} must be a positive integer`)
  }
  if (r.b2b_only && !/^(0|1|true|false|yes|no|y|n)$/i.test(r.b2b_only)) errs.push("b2b_only must be true/false")
  if (r.handle && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.handle)) errs.push("handle must be lowercase-kebab-case")
  return errs
}

// multipart/form-data: file (CSV, columns documented in README), optional status (draft|proposed|published).
// Each row runs its own createVendorProductWorkflow → one bad row never blocks the others.
// ponytail: sequential per-row workflows, capped at MAX_ROWS; move to a background job if vendors need bigger files.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const file = (req as unknown as { file?: Express.Multer.File }).file
  if (!file) throw new MedusaError(MedusaError.Types.INVALID_DATA, "CSV file is required (field `file`).")
  let rows: Row[]
  try {
    rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true })
  } catch (e) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid CSV: ${(e as Error).message}`)
  }
  if (rows.length > MAX_ROWS) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Max ${MAX_ROWS} rows per file.`)

  const { vendor } = await getCaller(req)
  const status = gateStatus(vendor.status, (req.body as { status?: string })?.status ?? "draft")
  const handles = [...new Set(rows.map((r) => r.category_handle).filter(Boolean))] as string[]
  const categories = handles.length
    ? await req.scope.resolve(Modules.PRODUCT).listProductCategories({ handle: handles }, { select: ["id", "handle"] })
    : []
  const catId = new Map(categories.map((c) => [c.handle, c.id]))

  const created: { row: number; id: string; handle: string }[] = []
  const errors: { row: number; handle?: string | null; errors: string[] }[] = []

  for (const [i, r] of rows.entries()) {
    const row = i + 2 // 1-based CSV line, header is line 1
    const errs = rowErrors(r)
    if (r.category_handle && !catId.has(r.category_handle)) errs.push(`unknown category_handle "${r.category_handle}"`)
    if (errs.length) {
      errors.push({ row, handle: r.handle, errors: errs })
      continue
    }
    const extra = {
      unit: r.unit || null,
      min_qty: num(r.min_qty) ?? null,
      qty_step: num(r.qty_step) ?? null,
      hs_code: r.hs_code || null,
      b2b_only: bool(r.b2b_only) ?? false,
    }
    const images = (r.image_urls ?? "")
      .split("|")
      .map((u) => u.trim())
      .filter(Boolean)
      .map((url) => ({ url }))
    const product = {
      title: r.title!,
      handle: r.handle || toHandle(r.title!),
      description: r.description || null,
      status,
      images,
      thumbnail: images[0]?.url ?? null,
      categories: r.category_handle ? [{ id: catId.get(r.category_handle)! }] : [],
      // ponytail: compare-at kept in metadata until sale price lists land (P2/P3).
      metadata: r.compare_at_usd ? { compare_at_usd: num(r.compare_at_usd) } : undefined,
      options: [{ title: "Default", values: ["Default"] }],
      variants: [
        {
          title: "Default",
          options: { Default: "Default" },
          prices: [{ currency_code: "usd", amount: num(r.price_usd)! }],
        },
      ],
      sales_channels: await salesChannelsFor(req.scope, extra),
    } as unknown as CreateProductWorkflowInputDTO
    try {
      const { result } = await createVendorProductWorkflow(req.scope).run({
        input: { vendor_id: vendor.id, product, extra },
      })
      created.push({ row, id: result.id, handle: result.handle })
    } catch (e) {
      errors.push({ row, handle: product.handle, errors: [(e as Error).message] })
    }
  }
  res.json({ created, errors })
}
