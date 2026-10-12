import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { basename, extname, resolve } from "node:path"
import sanitizeHtml from "sanitize-html"
import type { CreateProductWorkflowInputDTO, ExecArgs, LinkDefinition, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createProductsWorkflow, createRemoteLinkStep, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import seedDefaults from "./seed-defaults"
import seedCategories from "./seed-categories"
import { reindexAll } from "../lib/search"
import { salesChannelsFor } from "../api/vendors/products/helpers"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { PRODUCT_EXTRA_MODULE } from "../modules/product-extra"
import type ProductExtraModuleService from "../modules/product-extra/service"
import type { ProductExtraInput } from "../workflows/vendor-products"

// Stage 2 of the WP migration: loads tools/migrate-wp/out/*.json (stage-1 output, see its README) into Medusa.
// medusa exec ./src/scripts/import-wp.ts [out-dir] -- [--limit N] [--only vendors|products]   (out-dir defaults to $WP_OUT)
// Idempotent by legacy_id (vendor.legacy_id, product_extra.legacy_id): re-runs update changed rows, never duplicate.
// Resumable: products carry metadata.import_hash (unchanged rows are skipped), uploaded images are kept in <out-dir>/image-map.json.

const BATCH = 200
const IMG_CONCURRENCY = 16

type Img = { path: string; file: string; sha256: string }
type WpVendor = {
  legacy_id: number
  store_name: string
  handle: string
  email: string | null
  phone: string | null
  country: string | null
  city: string | null
  description: string | null
  logo_path: string | null
  banner_path: string | null
  tax_id: string | null
  commercial_reg_no: string | null
  export_card_no: string | null
}
type WpProduct = {
  legacy_id: number
  vendor_legacy_id: number
  status: "publish" | "pending"
  title: string | null
  handle: string
  description_html: string | null
  short_description_html: string | null
  sku: string | null
  regular_price: number | null
  sale_price: number | null
  category_legacy_ids: number[]
  tags: string[] | null
  attributes: Record<string, string[]> | null
  min_qty: number | null
  max_qty: number | null
  qty_step: number | null
  hs_code: string | null
  cost_price: number | null
  image_paths: string[]
}
type Row = { vendor_id: string; product: CreateProductWorkflowInputDTO; extra: ProductExtraInput & { legacy_id: string } }
type Counts = Record<string, number>

const bump = (c: Counts, k: string, n = 1) => (c[k] = (c[k] ?? 0) + n)
const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const posInt = (n: number | null) => (n != null && Number.isInteger(n) && n > 0 ? n : null)
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" }

// Keeps formatting HTML; drops script/style (with contents), inline event handlers, style attrs, javascript: URLs.
const clean = (html?: string | null) =>
  html ? sanitizeHtml(html, { allowedTags: sanitizeHtml.defaults.allowedTags.concat("img") }).trim() || null : null

const createExtrasStep = createStep(
  "import-wp-create-extras",
  async (extras: ProductExtraInput[], { container }) => {
    const svc: ProductExtraModuleService = container.resolve(PRODUCT_EXTRA_MODULE)
    const created = await svc.createProductExtras(extras)
    return new StepResponse(created, created.map((e) => e.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await (container.resolve(PRODUCT_EXTRA_MODULE) as ProductExtraModuleService).deleteProductExtras(ids)
  },
)

// Batch version of createVendorProductWorkflow: one rollback unit per batch.
const importWpProductsWorkflow = createWorkflow("import-wp-products", (input: { rows: Row[] }) => {
  const products = createProductsWorkflow.runAsStep({ input: transform(input, (i) => ({ products: i.rows.map((r) => r.product) })) })
  const extras = createExtrasStep(transform(input, (i) => i.rows.map((r) => r.extra)))
  const links = transform({ input, products, extras }, ({ input, products, extras }): LinkDefinition[] => {
    const pid = new Map(products.map((p) => [p.handle, p.id]))
    const eid = new Map(extras.map((e) => [e.legacy_id, e.id]))
    return input.rows.flatMap((r): LinkDefinition[] => [
      { [VENDOR_MODULE]: { vendor_id: r.vendor_id }, [Modules.PRODUCT]: { product_id: pid.get(r.product.handle!) } },
      { [Modules.PRODUCT]: { product_id: pid.get(r.product.handle!) }, [PRODUCT_EXTRA_MODULE]: { product_extra_id: eid.get(r.extra.legacy_id) } },
    ])
  })
  createRemoteLinkStep(links)
  return new WorkflowResponse(products)
})

// Runs fn on the whole batch; if that fails, row by row so one bad row only costs itself.
async function runSafe<T>(rows: T[], fn: (rows: T[]) => Promise<unknown>, failed: Counts) {
  try {
    await fn(rows)
    return rows.length
  } catch (e) {
    if (rows.length === 1) {
      bump(failed, (e as Error).message.slice(0, 120))
      return 0
    }
    let ok = 0
    for (const r of rows) ok += await runSafe([r], fn, failed)
    return ok
  }
}

export default async function importWp({ container, args }: ExecArgs) {
  const started = Date.now()
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  // medusa exec rejects unknown --flags; pass them after `--` (dropped from `args`, still in process.argv).
  const argv = [...args, ...process.argv]
  const flag = (name: string) => argv[argv.indexOf(`--${name}`) + 1]
  const limit = argv.includes("--limit") ? Number(flag("limit")) : undefined
  const only = argv.includes("--only") ? flag("only") : undefined
  const dir = args.find((a) => !a.startsWith("--")) ?? process.env.WP_OUT
  if (!dir) throw new Error("usage: medusa exec ./src/scripts/import-wp.ts <out-dir> -- [--limit N] [--only vendors|products] (or set WP_OUT)")
  const load = <T>(f: string): T => JSON.parse(readFileSync(resolve(dir, f), "utf8"))

  const allVendors = load<WpVendor[]>("vendors.json")
  const allProducts = load<WpProduct[]>("products.json")
  const images = load<{ images: Img[]; missing: { path: string }[] }>("images.json")
  const products = limit ? allProducts.slice(0, limit) : allProducts
  const wanted = new Set(products.map((p) => p.vendor_legacy_id))
  const vendors = !limit ? allVendors : only === "vendors" ? allVendors.slice(0, limit) : allVendors.filter((v) => wanted.has(v.legacy_id))

  const report = {
    vendors: { created: 0, updated: 0, unchanged: 0, owner_users_created: 0, skipped: {} as Counts },
    products: { created: 0, updated: 0, unchanged: 0, skipped: {} as Counts, failed: {} as Counts, notes: {} as Counts },
    images: { referenced: 0, unique: 0, uploaded: 0, already_uploaded: 0, missing: 0 },
  }

  // 1. Seeds (both idempotent).
  await seedDefaults({ container, args: [] })
  await seedCategories({ container, args: [resolve(dir, "categories.json")] })

  const imageUrl = await imageUploader(container, dir, images, report.images)
  const vendorSvc: VendorModuleService = container.resolve(VENDOR_MODULE)

  // 2. Vendors.
  if (only !== "products") {
    const published = new Set(allProducts.filter((p) => p.status === "publish").map((p) => p.vendor_legacy_id))
    const toUrl = await imageUrl(vendors.flatMap((v) => [v.logo_path, v.banner_path]).filter((p): p is string => !!p))
    const existing = new Map(
      (await vendorSvc.listVendors({ legacy_id: vendors.map((v) => String(v.legacy_id)) }, { take: null })).map((v) => [v.legacy_id, v]),
    )
    const emails = vendors.map((v) => v.email?.trim().toLowerCase()).filter((e): e is string => !!e)
    const users = await vendorSvc.listVendorUsers({ email: emails }, { relations: ["vendor"], take: null })
    const userByEmail = new Map(users.map((u) => [u.email, u]))
    const seen = new Set<string>()
    const create: Record<string, unknown>[] = []
    const ownerFor: { legacy_id: string; email: string }[] = []

    for (const v of vendors) {
      const legacy_id = String(v.legacy_id)
      const email = v.email?.trim().toLowerCase()
      const owner = email ? userByEmail.get(email) : undefined
      if (!email) {
        bump(report.vendors.skipped, "no email")
        continue
      }
      if (seen.has(email) || (owner && owner.vendor?.legacy_id !== legacy_id)) {
        bump(report.vendors.skipped, "duplicate email")
        continue
      }
      seen.add(email)
      const data = {
        name: v.store_name,
        handle: v.handle,
        description: clean(v.description),
        phone: v.phone,
        email,
        country: v.country,
        city: v.city,
        tax_id: v.tax_id,
        commercial_reg_no: v.commercial_reg_no,
        export_card_no: v.export_card_no,
        logo: v.logo_path ? (toUrl(v.logo_path) ?? null) : null,
        banner: v.banner_path ? (toUrl(v.banner_path) ?? null) : null,
        legacy_id,
      }
      const prev = existing.get(legacy_id) as Record<string, unknown> | undefined
      if (!owner) ownerFor.push({ legacy_id, email })
      if (!prev) {
        create.push({
          ...data,
          // Status/KYC only set on create, so staff decisions survive re-runs. Never `verified`: staff must re-verify.
          status: published.has(v.legacy_id) ? "approved" : "pending",
          kyc_status: v.tax_id || v.commercial_reg_no ? "submitted" : "none",
        })
      } else if (Object.entries(data).some(([k, val]) => (prev[k] ?? null) !== (val ?? null))) {
        await vendorSvc.updateVendors({ id: prev.id as string, ...data })
        report.vendors.updated++
      } else report.vendors.unchanged++
    }
    for (const batch of chunks(create, BATCH)) {
      ;(await vendorSvc.createVendors(batch)).forEach((v) => existing.set(v.legacy_id, v))
      report.vendors.created += batch.length
      logger.info(`import-wp: vendors created ${report.vendors.created}/${create.length}`)
    }
    // ponytail: owner gets no auth identity/password; WP users are sent a password-reset invite later (invite flow not built yet).
    for (const batch of chunks(ownerFor, BATCH)) {
      await vendorSvc.createVendorUsers(
        batch.map((o) => ({ email: o.email, role: "owner" as const, vendor_id: existing.get(o.legacy_id)!.id })),
      )
      report.vendors.owner_users_created += batch.length
    }
  }

  // 3–4. Products.
  if (only !== "vendors") await importProducts(container, dir, products, imageUrl, report.products, logger)

  // 6. ponytail: sales org + fee tiers have no modules yet → counted only, imported when those modules land.
  const org = load<{ branches: unknown[]; reps: unknown[]; assignments: unknown[] }>("sales_org.json")
  const tiers = load<unknown[]>("fee_tiers.json")
  const notImported = `branches ${org.branches.length}, reps ${org.reps.length}, assignments ${org.assignments.length}, fee tiers ${tiers.length}`
  logger.info(`import-wp: NOT imported (no module yet): ${notImported}`)

  // 7. Search.
  const indexed = process.env.MEILI_HOST ? await reindexAll(container) : null
  logger.info(`import-wp: search reindex ${indexed ?? "skipped (MEILI_HOST unset)"}`)

  const secs = Math.round((Date.now() - started) / 1000)
  writeFileSync(resolve(dir, "import-report.md"), renderReport(report, { limit, only, secs, indexed, notImported }))
  logger.info(`import-wp: done in ${secs}s ${JSON.stringify(report)}`)
  return report
}

// Uploads each original once per sha256 via the File module; sha → url persisted in <dir>/image-map.json.
// ponytail: the map is tied to the current file provider/bucket; delete it when switching providers (e.g. local → R2).
async function imageUploader(container: MedusaContainer, dir: string, images: { images: Img[] }, stats: Record<string, number>) {
  const mapFile = resolve(dir, "image-map.json")
  const map: Record<string, string> = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, "utf8")) : {}
  const byPath = new Map(images.images.map((i) => [i.path, i]))
  const seen = new Set<string>()
  const files = container.resolve(Modules.FILE)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return async (paths: string[]) => {
    const found = paths.map((p) => byPath.get(p)).filter((i): i is Img => !!i && existsSync(resolve(dir, i.file)))
    // Unique within the whole run (vendor logos and product images can share a file).
    const unique = [...new Map(found.map((i) => [i.sha256, i])).values()].filter((i) => !seen.has(i.sha256))
    unique.forEach((i) => seen.add(i.sha256))
    stats.referenced += paths.length
    stats.missing += paths.length - found.length
    stats.unique += unique.length
    const todo = unique.filter((i) => !map[i.sha256])
    stats.already_uploaded += unique.length - todo.length
    for (const batch of chunks(todo, IMG_CONCURRENCY)) {
      const uploaded = await files.createFiles(
        batch.map((i) => ({
          filename: basename(i.path),
          mimeType: MIME[extname(i.path).toLowerCase()] ?? "application/octet-stream",
          content: readFileSync(resolve(dir, i.file)).toString("base64"),
          access: "public" as const,
        })),
      )
      batch.forEach((i, n) => (map[i.sha256] = uploaded[n].url))
      stats.uploaded += batch.length
      writeFileSync(mapFile, JSON.stringify(map))
      if (stats.uploaded % 512 < IMG_CONCURRENCY) logger.info(`import-wp: images uploaded ${stats.uploaded} (this call: ${todo.length})`)
    }
    return (path: string) => map[byPath.get(path)?.sha256 ?? ""] as string | undefined
  }
}

async function importProducts(
  container: MedusaContainer,
  dir: string,
  products: WpProduct[],
  imageUrl: Awaited<ReturnType<typeof imageUploader>>,
  stats: { created: number; updated: number; unchanged: number; skipped: Counts; failed: Counts; notes: Counts },
  logger: { info: (m: string) => void },
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productSvc = container.resolve(Modules.PRODUCT)
  const extraSvc: ProductExtraModuleService = container.resolve(PRODUCT_EXTRA_MODULE)
  const vendorSvc: VendorModuleService = container.resolve(VENDOR_MODULE)

  const vendorId = new Map(
    (await vendorSvc.listVendors({ legacy_id: [...new Set(products.map((p) => String(p.vendor_legacy_id)))] }, { take: null })).map(
      (v) => [v.legacy_id, v.id],
    ),
  )
  const wpVendors = new Set(JSON.parse(readFileSync(resolve(dir, "vendors.json"), "utf8")).map((v: WpVendor) => v.legacy_id))
  const rows = products.filter((p) => {
    const reason = !p.title?.trim()
      ? "empty title"
      : p.regular_price == null
        ? "no price"
        : !wpVendors.has(p.vendor_legacy_id)
          ? "orphan (vendor not in dump)"
          : !vendorId.has(String(p.vendor_legacy_id))
            ? "vendor not imported (skipped/flagged)"
            : null
    if (reason) bump(stats.skipped, reason)
    return !reason
  })

  const cats: { legacy_id: number; handle: string }[] = JSON.parse(readFileSync(resolve(dir, "categories.json"), "utf8"))
  const catHandle = new Map(cats.map((c) => [c.legacy_id, c.handle]))
  const catId = new Map(
    (await productSvc.listProductCategories({ handle: cats.map((c) => c.handle) }, { select: ["id", "handle"], take: null })).map(
      (c) => [c.handle, c.id],
    ),
  )
  const tagValues = [...new Set(rows.flatMap((p) => (p.tags ?? []).map((t) => t.trim()).filter(Boolean)))]
  const tagId = new Map<string, string>()
  for (const batch of chunks(tagValues, 1000)) {
    const have = await productSvc.listProductTags({ value: batch }, { select: ["id", "value"], take: null })
    const missing = batch.filter((t) => !have.some((h) => h.value === t))
    const made = missing.length ? await productSvc.createProductTags(missing.map((value) => ({ value }))) : []
    ;[...have, ...made].forEach((t) => tagId.set(t.value, t.id))
  }
  const toUrl = await imageUrl(rows.flatMap((p) => p.image_paths))
  // Every imported product is b2c_enabled and not b2b_only → same channels for all.
  const salesChannels = await salesChannelsFor(container, { b2b_only: false, b2c_enabled: true })
  const seenSku = new Set<string>()

  const build = (p: WpProduct): Row => {
    const urls = [...new Set(p.image_paths.map(toUrl).filter((u): u is string => !!u))]
    let sku = p.sku?.trim() || null
    if (sku && seenSku.has(sku)) {
      bump(stats.notes, "sku dropped (duplicate of earlier product)")
      sku = null
    }
    if (sku) seenSku.add(sku)
    const min = posInt(p.min_qty)
    let max = posInt(p.max_qty)
    if (max != null && min != null && max < min) {
      bump(stats.notes, "max_qty dropped (< min_qty)")
      max = null
    }
    // ponytail: product_extra qty columns are integers; fractional WP values (e.g. 2.5 t) are dropped, not rounded.
    if ((p.min_qty != null && min == null) || (p.qty_step != null && posInt(p.qty_step) == null))
      bump(stats.notes, "min_qty/qty_step dropped (not a positive integer)")
    const extra = {
      unit: p.attributes?.unit?.[0] ?? null,
      min_qty: min,
      max_qty: max,
      qty_step: posInt(p.qty_step),
      hs_code: p.hs_code,
      cost_price: p.cost_price,
      b2b_only: false,
      b2c_enabled: true,
      origin_country: "EG",
      legacy_id: String(p.legacy_id),
    }
    const { unit, ...otherAttributes } = p.attributes ?? {} // eslint-disable-line @typescript-eslint/no-unused-vars
    const product = {
      title: p.title!.trim(),
      handle: p.handle,
      // ponytail: short description only used when there is no long one.
      description: clean(p.description_html) ?? clean(p.short_description_html),
      status: p.status === "publish" ? ProductStatus.PUBLISHED : ProductStatus.PROPOSED,
      images: urls.map((url) => ({ url })),
      thumbnail: urls[0] ?? null,
      category_ids: p.category_legacy_ids.map((id) => catId.get(catHandle.get(id) ?? "")).filter((id): id is string => !!id),
      tag_ids: [...new Set((p.tags ?? []).map((t) => tagId.get(t.trim())).filter((id): id is string => !!id))],
      // ponytail: sale price kept in metadata (regular stays the price) until sale price lists land (P2/P3), like CSV import's compare_at.
      metadata: {
        ...(p.sale_price != null && { sale_price_usd: p.sale_price }),
        ...(Object.keys(otherAttributes).length && { wp_attributes: otherAttributes }),
      } as Record<string, unknown>,
      sales_channels: salesChannels,
      options: [{ title: "Default", values: ["Default"] }],
      variants: [{ title: "Default", sku, options: { Default: "Default" }, prices: [{ currency_code: "usd", amount: p.regular_price! }] }],
    }
    const vendor_id = vendorId.get(String(p.vendor_legacy_id))!
    product.metadata.import_hash = createHash("sha256").update(JSON.stringify({ product, extra, vendor_id })).digest("hex").slice(0, 16)
    return { vendor_id, product: product as unknown as CreateProductWorkflowInputDTO, extra }
  }

  let done = 0
  for (const batch of chunks(rows.map(build), BATCH)) {
    const { data } = await query.graph({
      entity: "product_extra",
      fields: ["id", "legacy_id", "product.id", "product.metadata", "product.variants.id"],
      filters: { legacy_id: batch.map((r) => r.extra.legacy_id) },
    })
    const prev = new Map(
      (data as { id: string; legacy_id: string; product?: { id: string; metadata: Record<string, unknown> | null; variants: { id: string }[] } }[])
        .filter((e) => e.product)
        .map((e) => [e.legacy_id, e]),
    )
    const create = batch.filter((r) => !prev.has(r.extra.legacy_id))
    const update = batch.filter((r) => {
      const e = prev.get(r.extra.legacy_id)
      return e && e.product!.metadata?.import_hash !== r.product.metadata!.import_hash
    })
    stats.unchanged += batch.length - create.length - update.length

    if (create.length) stats.created += await runSafe(create, (rows) => importWpProductsWorkflow(container).run({ input: { rows } }), stats.failed)
    if (update.length) {
      stats.updated += await runSafe(
        update,
        async (rows) => {
          // Extras first, product (carrying the new import_hash) last → a failed product update is retried next run.
          await extraSvc.updateProductExtras(rows.map((r) => ({ ...r.extra, id: prev.get(r.extra.legacy_id)!.id })))
          await updateProductsWorkflow(container).run({
            input: {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              products: rows.map(({ extra, product: { options, variants, ...p } }) => {
                const { id, variants: [variant] } = prev.get(extra.legacy_id)!.product!
                const [v] = variants!
                return { ...p, handle: p.handle!, id, variants: [{ id: variant?.id, title: v.title, sku: v.sku, prices: v.prices }] }
              }),
            },
          })
        },
        stats.failed,
      )
    }
    done += batch.length
    logger.info(
      `import-wp: products ${done}/${rows.length} (created ${stats.created}, updated ${stats.updated}, unchanged ${stats.unchanged}, failed ${Object.values(stats.failed).reduce((a, b) => a + b, 0)})`,
    )
  }
}

function renderReport(
  r: { vendors: Record<string, number | Counts>; products: Record<string, number | Counts>; images: Record<string, number> },
  run: { limit?: number; only?: string; secs: number; indexed: number | null; notImported: string },
) {
  const section = (title: string, o: Record<string, number | Counts>) =>
    [
      `## ${title}`,
      "| metric | count |",
      "|---|---|",
      ...Object.entries(o).flatMap(([k, v]) =>
        typeof v === "number" ? [`| ${k} | ${v} |`] : Object.entries(v).map(([reason, n]) => `| ${k}: ${reason} | ${n} |`),
      ),
      "",
    ].join("\n")
  return [
    "# WP import report",
    "",
    "Generated by `import-wp.ts`. Counts only, no PII.",
    "",
    `Run: ${run.limit ? `--limit ${run.limit} ` : ""}${run.only ? `--only ${run.only} ` : ""}duration ${run.secs}s, search indexed ${run.indexed ?? "skipped"}.`,
    "",
    section("Vendors", r.vendors),
    section("Products", r.products),
    section("Images", r.images),
    `## Not imported (no module yet)\n${run.notImported}\n`,
  ].join("\n")
}
