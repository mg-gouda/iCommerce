// Stage 1: WP dump (temp MySQL) → normalized JSON in out/. See README.md.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import mysql from "mysql2/promise"
import { attrKey, cleanText, htmlImageUrls, isoDate, mapProductAttributes, parsePrice, parseQty, phpUnserialize, slugify, stripSizeSuffix, titleCaseIfAllCaps, uniqueHandles, uploadsRelative } from "./transforms.ts"

const P = process.env.WP_PREFIX ?? "wWWvr_"
// Searched in order. recovered-uploads = 2022/03–06 originals pulled from the Jun-2022 .wpress (the copied uploads/ lacks them).
const UPLOAD_ROOTS = (process.env.WP_UPLOADS ?? "Old WP Project/marketplace/wp-content/uploads,Old WP Project/recovered-uploads")
  .split(",").map((r) => resolve(import.meta.dirname, "../../..", r))
const onDisk = (p: string) => UPLOAD_ROOTS.map((r) => join(r, p)).find((f) => existsSync(f))
const OUT = resolve(import.meta.dirname, "../out")
const db = await mysql.createConnection({
  host: "127.0.0.1", port: Number(process.env.WP_DB_PORT ?? 3317), user: "root", database: process.env.WP_DB ?? "wp",
  dateStrings: true, charset: "utf8mb4",
})
type Row = Record<string, string | number | null>
const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args))[0] as Row[]
const str = (v: unknown) => (v == null ? "" : String(v))
const blank = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0)
const first = (...vs: unknown[]) => { for (const v of vs) { const s = cleanText(str(v)); if (s) return s } return null }
const byId = <T extends { legacy_id: number }>(a: T[]) => a.sort((x, y) => x.legacy_id - y.legacy_id)
const metaMap = (rows: Row[], idCol: string) => {
  const m = new Map<number, Record<string, string>>()
  for (const r of rows) {
    const id = Number(r[idCol]); const o = m.get(id) ?? {}
    o[str(r.meta_key)] = str(r.meta_value); m.set(id, o)
  }
  return m
}
const issues: string[] = []
const note = (s: string) => issues.push(s)

// ---------- attachments / images ----------
const attached = new Map((await q(`select post_id, meta_value from ${P}postmeta where meta_key='_wp_attached_file' order by meta_id`)).map((r) => [Number(r.post_id), str(r.meta_value)]))
const images = new Map<string, Set<string>>()
const missing = new Map<string, Set<string>>()
let brokenAttachmentRefs = 0
/** uploads-relative path (or attachment id) → original on disk, registered under `owner`. */
const resolveImage = (ref: string | number | null | undefined, owner: string): string | null => {
  if (ref == null || ref === "" || ref === "0" || ref === 0) return null
  let p: string | null | undefined = /^\d+$/.test(String(ref)) ? attached.get(Number(ref)) : String(ref).startsWith("http") ? uploadsRelative(String(ref)) : String(ref)
  if (!p) { brokenAttachmentRefs++; return null }
  p = p.replace(/^\/+/, "")
  const orig = stripSizeSuffix(p)
  const hit = onDisk(orig) ? orig : onDisk(p) ? p : null
  // ponytail: not on disk → keep WP's attached path (= original upload); listed in images.json missing[].
  const bucket = hit ? images : missing
  const key = hit ?? p
  ;(bucket.get(key) ?? bucket.set(key, new Set()).get(key)!).add(owner)
  return key
}

/** <img src/srcset> in description HTML pointing at WP uploads (any host) → resolved paths, registered like product images. */
const descImages = (owner: string, ...html: string[]) => [...new Set(html.flatMap(htmlImageUrls).map(uploadsRelative)
  .map((p) => (p ? resolveImage(p, owner) : null)).filter((x): x is string => !!x))]

// ---------- categories ----------
const catRows = await q(`select t.term_id, t.name, t.slug, tt.parent, tt.term_taxonomy_id from ${P}term_taxonomy tt join ${P}terms t using(term_id) where tt.taxonomy='product_cat' order by t.term_id`)

// ---------- products ----------
const STATUSES = ["publish", "pending"]
const productRows = await q(`select ID, post_author, post_status, post_title, post_name, post_content, post_excerpt, post_date, post_date_gmt from ${P}posts where post_type='product' and post_status in (?) order by ID`, [STATUSES])
const statusCountsTyped = await q(`select post_type, post_status, count(*) n from ${P}posts where post_type in ('product','product_variation') group by 1,2 order by 1,2`)
const PMETA = ["_sku", "_regular_price", "_sale_price", "_price", "_thumbnail_id", "_product_image_gallery", "_product_attributes", "minimum_allowed_quantity", "maximum_allowed_quantity", "group_of_quantity", "_woo_uom_input", "_wc_cog_cost", "venderproductlink"]
const pmeta = metaMap(await q(`select m.post_id, m.meta_key, m.meta_value from ${P}postmeta m join ${P}posts p on p.ID=m.post_id where p.post_type='product' and p.post_status in (?) and m.meta_key in (?) order by m.meta_id`, [STATUSES, PMETA]), "post_id")
const termRows = await q(`select r.object_id, tt.taxonomy, tt.term_taxonomy_id, t.name from ${P}term_relationships r join ${P}term_taxonomy tt using(term_taxonomy_id) join ${P}terms t using(term_id) join ${P}posts p on p.ID=r.object_id where p.post_type='product' and p.post_status in (?) and (tt.taxonomy in ('product_cat','product_tag','product_type') or tt.taxonomy like 'pa\\_%') order by r.object_id, tt.taxonomy, t.name`, [STATUSES])
const terms = new Map<number, Row[]>()
for (const r of termRows) (terms.get(Number(r.object_id)) ?? terms.set(Number(r.object_id), []).get(Number(r.object_id))!).push(r)
const catByTt = new Map(catRows.map((c) => [Number(c.term_taxonomy_id), Number(c.term_id)]))
// ponytail: variations not exported; only fold min variation price into a price-less variable parent.
const variationPrice = new Map<number, number>()
for (const r of await q(`select p.post_parent, m.meta_value from ${P}posts p join ${P}postmeta m on m.post_id=p.ID and m.meta_key in ('_regular_price','_price') where p.post_type='product_variation' and p.post_status='publish'`)) {
  const v = parsePrice(r.meta_value); const id = Number(r.post_parent)
  if (v != null && v > 0 && (!variationPrice.has(id) || v < variationPrice.get(id)!)) variationPrice.set(id, v)
}

// ---------- vendors ----------
const vendorRows = await q(`select u.ID, u.user_email, u.user_registered, u.display_name from ${P}users u join ${P}usermeta c on c.user_id=u.ID and c.meta_key='${P}capabilities' where c.meta_value like '%wcfm_vendor%' order by u.ID`)
const UMETA = ["wcfmmp_profile_settings", "wcfmmp_store_name", "store_name", "company-name", "billing_company", "_store_description", "billing_phone", "mobile-number", "_wcfm_street_1", "_wcfm_street_2", "_wcfm_city", "_wcfm_country", "billing_address_1", "billing_address_2", "billing_city", "billing_country", "tax-id-number", "tax-id", "commercial-registration-number", "commercial-registration-id-no", "registration-id-no", "export-card-number", "export-card-no", `${P}user_avatar`]
const umeta = metaMap(await q(`select m.user_id, m.meta_key, m.meta_value from ${P}usermeta m join ${P}usermeta c on c.user_id=m.user_id and c.meta_key='${P}capabilities' where c.meta_value like '%wcfm_vendor%' and m.meta_key in (?) order by m.umeta_id`, [UMETA]), "user_id")
const vendorIds = new Set(vendorRows.map((v) => Number(v.ID)))

// products first pass (counts need it)
const productHandle = uniqueHandles()
let attrParseFail = 0
const products = byId(productRows.map((p) => {
  const id = Number(p.ID); const m = pmeta.get(id) ?? {}; const t = terms.get(id) ?? []
  const owner = `product:${id}`
  const title = cleanText(str(p.post_title))
  if (m._product_attributes && phpUnserialize(m._product_attributes) == null) attrParseFail++
  const { custom, taxonomies } = mapProductAttributes(m._product_attributes)
  const attributes: Record<string, string[]> = { ...custom }
  for (const r of t) if (str(r.taxonomy).startsWith("pa_") && taxonomies.includes(str(r.taxonomy))) (attributes[attrKey(str(r.taxonomy))] ??= []).push(cleanText(str(r.name)))
  const hs = attributes.hs_code?.[0] ?? null; delete attributes.hs_code
  // ponytail: unit = UoM-plugin meta, else pa_unit / pa_unit-of-measure; lowercased only, typos ("peice") left for admin cleanup.
  const unit = cleanText(m._woo_uom_input) || attributes.unit?.[0] || attributes.unit_of_measure?.[0]
  delete attributes.unit_of_measure
  if (unit) attributes.unit = [unit.toLowerCase()]
  const isVariable = t.some((r) => r.taxonomy === "product_type" && r.name === "variable")
  const regular = parsePrice(m._regular_price) ?? parsePrice(m._price) ?? (isVariable ? variationPrice.get(id) ?? null : null)
  const gallery = str(m._product_image_gallery).split(",").map((s) => s.trim()).filter(Boolean)
  const image_paths = [...new Set([m._thumbnail_id, ...gallery].map((ref) => resolveImage(ref, owner)).filter((x): x is string => !!x))]
  return {
    legacy_id: id,
    vendor_legacy_id: Number(p.post_author),
    status: str(p.post_status) as "publish" | "pending",
    title,
    handle: productHandle(slugify(str(p.post_name)) || slugify(title), `product-${id}`),
    description_html: str(p.post_content).trim(),
    short_description_html: str(p.post_excerpt).trim(),
    sku: cleanText(m._sku) || null,
    regular_price: regular,
    sale_price: parsePrice(m._sale_price),
    currency: "USD",
    category_legacy_ids: [...new Set(t.filter((r) => r.taxonomy === "product_cat").map((r) => catByTt.get(Number(r.term_taxonomy_id))!))].sort((a, b) => a - b),
    tags: [...new Set(t.filter((r) => r.taxonomy === "product_tag").map((r) => cleanText(str(r.name))).filter(Boolean))].sort(),
    attributes: Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...new Set(v)]])),
    min_qty: parseQty(m.minimum_allowed_quantity),
    max_qty: parseQty(m.maximum_allowed_quantity),
    qty_step: parseQty(m.group_of_quantity),
    hs_code: hs,
    cost_price: parsePrice(m._wc_cog_cost),
    vendor_product_link: cleanText(m.venderproductlink) || null,
    image_paths,
    description_image_paths: descImages(owner, str(p.post_content), str(p.post_excerpt)),
    created_at: isoDate(str(p.post_date_gmt), str(p.post_date)),
  }
}))

const countBy = (xs: number[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<number, number>())
const productsPerVendor = countBy(products.map((p) => p.vendor_legacy_id))
const productsPerCat = countBy(products.flatMap((p) => p.category_legacy_ids))

const catHandle = uniqueHandles()
const categories = catRows.map((c) => ({
  legacy_id: Number(c.term_id),
  name: titleCaseIfAllCaps(cleanText(str(c.name))),
  handle: catHandle(slugify(str(c.slug)) || slugify(str(c.name)), `category-${c.term_id}`),
  parent_legacy_id: Number(c.parent) || null,
  product_count: productsPerCat.get(Number(c.term_id)) ?? 0,
}))

const vendorHandle = uniqueHandles()
let profileParseFail = 0
const vendors = byId(vendorRows.map((u) => {
  const id = Number(u.ID); const m = umeta.get(id) ?? {}; const owner = `vendor:${id}`
  const raw = phpUnserialize(m.wcfmmp_profile_settings)
  if (m.wcfmmp_profile_settings && !raw) profileParseFail++
  const ps = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const addr = (ps.address && typeof ps.address === "object" ? ps.address : {}) as Record<string, unknown>
  const store_name = first(ps.store_name, m.wcfmmp_store_name, m.store_name, m["company-name"], m.billing_company, u.display_name) ?? `Vendor ${id}`
  const slugSrc = typeof ps.store_slug === "string" && !/^https?:/.test(ps.store_slug) ? ps.store_slug : ""
  return {
    legacy_id: id,
    store_name,
    handle: vendorHandle(slugify(slugSrc) || slugify(store_name), `vendor-${id}`),
    email: first(u.user_email, ps.store_email),
    phone: first(ps.phone, m.billing_phone, m["mobile-number"]),
    country: first(addr.country, m._wcfm_country, m.billing_country),
    city: first(addr.city, m._wcfm_city, m.billing_city),
    address: first([addr.street_1, addr.street_2].map(str).filter(Boolean).join(", "), [m._wcfm_street_1, m._wcfm_street_2].filter(Boolean).join(", "), [m.billing_address_1, m.billing_address_2].filter(Boolean).join(", ")),
    description: str(ps.shop_description || m._store_description).trim() || null,
    logo_path: resolveImage((ps.gravatar as string) || m[`${P}user_avatar`], owner),
    banner_path: resolveImage(ps.banner as string, owner),
    description_image_paths: descImages(owner, str(ps.shop_description || m._store_description)),
    // ponytail: spec'd KYC keys (`tax-id-number` …) are ~empty; real data lives in the registration-form keys → fallback.
    tax_id: first(m["tax-id-number"], m["tax-id"]),
    commercial_reg_no: first(m["commercial-registration-number"], m["commercial-registration-id-no"], m["registration-id-no"]),
    export_card_no: first(m["export-card-number"], m["export-card-no"]),
    registered_at: isoDate(str(u.user_registered)),
    // ponytail: wcfm_membership_subscription has 5 rows, all subscr_cancel for a deleted plan → no live plans to map.
    membership_plan: null,
    product_count: productsPerVendor.get(id) ?? 0,
  }
}))

// ---------- sales org ----------
const code = (v: unknown) => { const s = str(v).trim(); return s && s !== "no-select" ? s : null }
const branches = (await q(`select id, Branch_ID, Branch_Name from Branch_Name order by Branch_ID, id`)).map((r) => ({ legacy_id: Number(r.id), code: str(r.Branch_ID), name: cleanText(str(r.Branch_Name)) }))
const rep = (type: string, parentKey: "branch_code" | "manager_code") => (r: Row) => ({ type, legacy_id: Number(r.id), code: str(r.Account_ID ?? r.Brok_ID), name: cleanText(str(r.Account_Name ?? r.Broker_name)), branch_code: null as string | null, manager_code: null as string | null, [parentKey]: str(r.BR_ID) })
const reps = [
  ...(await q(`select * from Branch_Account_Manager_top order by id`)).map(rep("branch_manager", "branch_code")),
  // ponytail: BR_ID on account managers / brokers points at a branch manager's Account_ID (e.g. '07'), not a Branch_ID.
  ...(await q(`select * from Branch_Account_Manager order by id`)).map(rep("account_manager", "manager_code")),
  ...(await q(`select * from Intro_Broker order by id`)).map(rep("broker", "manager_code")),
]
const assignRows = metaMap(await q(`select user_id, meta_key, meta_value from ${P}usermeta where meta_key in ('branch_id','branch_manger_id','account_id','broker_id') order by umeta_id`), "user_id")
const assignments = [...assignRows].map(([uid, m]) => ({ user_legacy_id: uid, is_vendor: vendorIds.has(uid), branch_code: code(m.branch_id), branch_manager_code: code(m.branch_manger_id), account_manager_code: code(m.account_id), broker_code: code(m.broker_id) }))
  .filter((a) => a.branch_code || a.branch_manager_code || a.account_manager_code || a.broker_code)
  .sort((a, b) => a.user_legacy_id - b.user_legacy_id)

// ---------- fee tiers ----------
const fee_tiers = (await q(`select * from intermediation_fees order by cast(amount as decimal(14,2)), id`)).map((r) => ({
  legacy_id: Number(r.id), channel: "b2b", basis: "monthly_volume", min_orders: parseQty(r.orders), min_amount: parsePrice(r.amount), percent: parsePrice(r.fees), min_fee: parsePrice(r.minFees), max_fee: parsePrice(r.maxFees), currency: "USD",
}))

// ---------- images manifest ----------
const sorted = <T>(m: Map<string, Set<string>>, f: (p: string, used: string[]) => T) => [...m.keys()].sort().map((p) => f(p, [...m.get(p)!].sort()))
const imageManifest = sorted(images, (path, used_by) => {
  const file = onDisk(path)!
  const buf = readFileSync(file)
  // ponytail: absolute `file` is machine-local; out/ never leaves this machine.
  return { path, file, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), used_by }
})
const missingManifest = sorted(missing, (path, used_by) => ({ path, used_by }))
await db.end()

// ---------- write ----------
mkdirSync(OUT, { recursive: true })
const write = (f: string, d: unknown) => writeFileSync(join(OUT, f), JSON.stringify(d, null, 2) + "\n")
write("categories.json", categories)
write("vendors.json", vendors)
write("products.json", products)
write("sales_org.json", { branches, reps, assignments })
write("fee_tiers.json", fee_tiers)
write("images.json", { images: imageManifest, missing: missingManifest })

// ---------- report ----------
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a")
const coverage = (rows: Record<string, unknown>[], skip: string[] = []) => rows.length === 0 ? "" : Object.keys(rows[0]).filter((k) => !skip.includes(k))
  .map((k) => `| ${k} | ${pct(rows.filter((r) => !blank(r[k]) && !(typeof r[k] === "object" && !Array.isArray(r[k]) && Object.keys(r[k] as object).length === 0)).length, rows.length)} |`).join("\n")
const dupes = (xs: (string | null)[]) => { const c = new Map<string, number>(); for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1); return [...c.values()].filter((n) => n > 1) }
const sku = dupes(products.map((p) => p.sku))
const sha = dupes(imageManifest.map((i) => i.sha256))
const rawProductSlugDupes = dupes(productRows.map((r) => slugify(str(r.post_name)) || slugify(cleanText(str(r.post_title)))))
const rawVendorSlugDupes = dupes(vendors.map((v) => v.handle.replace(/-\d+$/, "")))
const exp = { publish: 16505, pending: 428 }
const cnt = (s: string) => products.filter((p) => p.status === s).length
const line = (label: string, got: number, want: number) => `| ${label} | ${got} | ${want} | ${want ? (((got - want) / want) * 100).toFixed(2) + "%" : ""} |`
const totalBytes = imageManifest.reduce((s, i) => s + i.bytes, 0)
const priceIssue = (f: (n: number | null) => boolean) => products.filter((p) => f(p.regular_price)).length
const attrKeys = [...new Set(products.flatMap((p) => Object.keys(p.attributes)))].sort()
const units = new Set(products.map((p) => p.attributes.unit?.[0]).filter(Boolean))
if (attrParseFail) note(`_product_attributes failed to unserialize for ${attrParseFail} products`)
if (profileParseFail) note(`wcfmmp_profile_settings failed to unserialize for ${profileParseFail} vendors (fell back to plain meta)`)

const report = `# WP extract report

Generated by \`pnpm extract\`. Deterministic (no timestamps). Contains no PII.

## Counts vs audit
| entity | extracted | audit | diff |
|---|---|---|---|
${line("categories", categories.length, 97)}
${line("vendors", vendors.length, 1181)}
${line("products publish", cnt("publish"), exp.publish)}
${line("products pending", cnt("pending"), exp.pending)}
${line("branches", branches.length, 7)}
${line("branch managers", reps.filter((r) => r.type === "branch_manager").length, 7)}
${line("fee tiers", fee_tiers.length, 4)}

Rep breakdown: ${["branch_manager", "account_manager", "broker"].map((t) => `${t} ${reps.filter((r) => r.type === t).length}`).join(" · ")}. User assignments with ≥1 code: ${assignments.length} (${assignments.filter((a) => a.is_vendor).length} vendors).

All post statuses (not exported unless publish/pending):
${statusCountsTyped.map((r) => `- ${r.post_type} / ${r.post_status}: ${r.n}`).join("\n")}

Variations: not exported. Variable parents among exported products: ${products.filter((p) => (terms.get(p.legacy_id) ?? []).some((r) => r.name === "variable")).length}; parents that got a price folded from their variations: ${products.filter((p) => variationPrice.has(p.legacy_id) && parsePrice((pmeta.get(p.legacy_id) ?? {})._regular_price) == null && parsePrice((pmeta.get(p.legacy_id) ?? {})._price) == null).length}.

## Field coverage
### vendors (${vendors.length})
| field | present |
|---|---|
${coverage(vendors)}

### products (${products.length})
| field | present |
|---|---|
${coverage(products)}

Attribute keys seen: ${attrKeys.join(", ")}. Distinct units: ${units.size}.

### categories (${categories.length})
| field | present |
|---|---|
${coverage(categories)}

Categories with 0 exported products: ${categories.filter((c) => c.product_count === 0).length}. Parents: ${categories.filter((c) => c.parent_legacy_id).length} (flat taxonomy).

## Duplicates
- Product handles colliding before dedupe: ${rawProductSlugDupes.length} groups (${rawProductSlugDupes.reduce((a, b) => a + b, 0)} products) → suffixed \`-2\`, \`-3\`…
- Vendor handles colliding before dedupe: ${rawVendorSlugDupes.length} groups
- SKUs shared by >1 product: ${sku.length} groups (${sku.reduce((a, b) => a + b, 0)} products); SKUs kept as-is
- Image files with identical sha256: ${sha.length} groups (${sha.reduce((a, b) => a + b, 0)} files)

## Data issues
- Empty titles: ${products.filter((p) => !p.title).length}
- Missing regular price: ${priceIssue((n) => n == null)}
- Zero price: ${priceIssue((n) => n === 0)}
- Negative price: ${priceIssue((n) => n != null && n < 0)}
- Sale price ≥ regular: ${products.filter((p) => p.sale_price != null && p.regular_price != null && p.sale_price >= p.regular_price).length}
- min_qty > max_qty: ${products.filter((p) => p.min_qty != null && p.max_qty != null && p.min_qty > p.max_qty).length}
- Products without category: ${products.filter((p) => p.category_legacy_ids.length === 0).length}
- Descriptions with WP-uploads images: ${products.filter((p) => p.description_image_paths.length).length} products (${products.reduce((n, p) => n + p.description_image_paths.length, 0)} images), ${vendors.filter((v) => v.description_image_paths.length).length} vendors
- Products without any image ref: ${products.filter((p) => p.image_paths.length === 0).length}
- Products whose images are all missing on disk: ${products.filter((p) => p.image_paths.length > 0 && p.image_paths.every((i) => missing.has(i))).length}
- Vendor logo/banner refs missing on disk: ${vendors.filter((v) => missing.has(v.logo_path ?? "")).length} / ${vendors.filter((v) => missing.has(v.banner_path ?? "")).length}
- Orphan products (author not a wcfm_vendor): ${products.filter((p) => !vendorIds.has(p.vendor_legacy_id)).length} (owner ids: ${[...new Set(products.filter((p) => !vendorIds.has(p.vendor_legacy_id)).map((p) => p.vendor_legacy_id))].length} distinct users)
- Vendors with 0 exported products: ${vendors.filter((v) => v.product_count === 0).length}
- Broken image refs (attachment id/url not resolvable): ${brokenAttachmentRefs}
- Referenced image files missing on disk: ${missingManifest.length}
${issues.map((s) => `- ${s}`).join("\n")}

## Images
- Originals referenced + on disk: ${imageManifest.length}
- Total bytes: ${totalBytes} (${(totalBytes / 1024 ** 3).toFixed(2)} GiB)
- Missing: ${missingManifest.length}
`
writeFileSync(join(OUT, "report.md"), report)
console.log(`wrote ${OUT}: ${categories.length} categories, ${vendors.length} vendors, ${products.length} products, ${imageManifest.length} images (${missingManifest.length} missing)`)
