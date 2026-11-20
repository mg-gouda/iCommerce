import type { MedusaResponse } from "@medusajs/framework/http"
import type { Knex } from "@medusajs/framework/mikro-orm/knex"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateEntityId, MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { companySvc } from "./company"
import { channelOf } from "./fees"
import { cents, major } from "./money"
import { parse } from "./parse"
import { quoteSvc } from "./quotes"
import { ATTR_KEYS, salesOrgSvc } from "./sales-org"
import { vendorOrderLinks } from "./vendor-orders"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86_400_000
const db = (scope: MedusaContainer) => scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
const query = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.QUERY)
const big = (n: number) => ({ value: String(n), precision: 20 }) // raw_* column of a bigNumber

/** `total` cents over `weights` pro rata: each part rounded, the residual on the largest weight → Σ = total exactly. */
export function splitResidual(total: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (!sum) return weights.map(() => 0)
  const parts = weights.map((w) => Math.round((total * w) / sum))
  parts[weights.indexOf(Math.max(...weights))] += total - parts.reduce((s, p) => s + p, 0)
  return parts
}

/** Fact rows of one vendor child order (none when it, its parent or its vendor link is canceled). */
async function factRows(scope: MedusaContainer, o: Row) {
  const parentId = o.metadata?.parent_order_id as string | undefined
  if (!parentId || o.status === "canceled") return []
  const { data: [p] } = await query(scope).graph({ entity: "order", fields: ["id", "status", "created_at"], filters: { id: parentId } })
  const [link] = await vendorOrderLinks(scope, { order_id: o.id })
  if (!p || p.status === "canceled" || link?.status === "canceled") return []
  const items = ((o.items ?? []) as Row[]).filter(Boolean)
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[]
  const { data: products } = productIds.length
    ? await query(scope).graph({ entity: "product", fields: ["id", "categories.id"], filters: { id: productIds } })
    : { data: [] }
  const catOf = new Map((products as Row[]).map((x) => [x.id, x.categories?.[0]?.id ?? null]))
  const [member] = o.customer_id ? await companySvc(scope).listCompanyMembers({ customer_id: o.customer_id }, { relations: ["company"] }) : []
  const company = (member as Row | undefined)?.company
  const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ")
  const attr = (o.metadata?.sales_attribution ?? {}) as Row
  const gross = items.map((i) => cents(Number(i.unit_price) * Number(i.quantity)))
  const fee = splitResidual(cents(o.metadata?.fee_share), gross)
  const base = {
    order_id: o.id, parent_order_id: parentId, vendor_id: o.metadata.vendor_id, day: new Date(p.created_at).toISOString().slice(0, 10),
    channel: await channelOf(scope, o.sales_channel_id), country_code: o.shipping_address?.country_code?.toLowerCase() ?? null,
    customer_id: o.customer_id ?? null, company_id: company?.id ?? null, buyer_label: company?.name || name || o.email || "",
    paid: !!o.metadata?.paid_at, ...Object.fromEntries(ATTR_KEYS.map((k) => [k, attr[k] ?? null])),
  }
  return items.map((i, k) => {
    const nums = { quantity: Number(i.quantity), gross: major(gross[k]), commission: major(cents(i.metadata?.commission?.amount)), fee_share: major(fee[k]) }
    return {
      id: generateEntityId(undefined, "rline"), ...base, product_id: i.product_id ?? null, variant_id: i.variant_id ?? null,
      category_id: catOf.get(i.product_id) ?? null, ...nums, ...Object.fromEntries(Object.entries(nums).map(([f, n]) => [`raw_${f}`, big(n)])),
    }
  })
}

/** Deletes and re-inserts one child order's facts in one transaction (fully recomputed). Parent id → its children. */
export async function rebuildOrderFacts(scope: MedusaContainer, orderId: string): Promise<number> {
  const { data: [o] } = await query(scope).graph({
    entity: "order",
    fields: [
      "id", "status", "email", "metadata", "sales_channel_id", "customer_id", "customer.first_name", "customer.last_name",
      "shipping_address.country_code", "items.*",
    ],
    filters: { id: orderId },
  })
  if (o && !o.metadata?.parent_order_id) return rebuildFacts(scope, (o.metadata?.vendor_order_ids ?? []) as string[])
  const rows = o ? await factRows(scope, o) : []
  await db(scope).transaction(async (trx) => {
    await trx("report_line").where({ order_id: orderId }).delete()
    if (rows.length) await trx("report_line").insert(rows)
  })
  return rows.length
}

export async function rebuildFacts(scope: MedusaContainer, ids: string[]) {
  let n = 0
  for (const id of ids) n += await rebuildOrderFacts(scope, id)
  return n
}

/** Child order ids touched since `since` (directly or through their parent). */
export async function childOrdersUpdatedSince(scope: MedusaContainer, since: Date) {
  const { data } = await query(scope).graph({ entity: "order", fields: ["id", "metadata"], filters: { updated_at: { $gte: since } } as never })
  return [...new Set((data as Row[]).flatMap((o) => (o.metadata?.parent_order_id ? [o.id] : ((o.metadata?.vendor_order_ids ?? []) as string[]))))]
}

// ---------- queries ----------

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)
const dayStr = z.string().refine(isDay, "expected YYYY-MM-DD")
export const ReportQuery = z.object({
  from: dayStr.optional(),
  to: dayStr.optional(),
  channel: z.enum(["b2b", "b2c"]).optional(),
  paid: z.enum(["true", "false"]).optional(),
  interval: z.enum(["day", "week", "month"]).optional(),
  format: z.enum(["json", "csv"]).optional(),
  by: z.string().optional(),
  locale: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type ReportParams = z.infer<typeof ReportQuery>
export type Filters = { from: string; to: string; channel?: "b2b" | "b2c"; paid?: boolean; vendor_id?: string }

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const at = (d: string) => Date.parse(`${d}T00:00:00Z`)

/** Range defaults to the last 30 days ending today (UTC). */
export function filtersOf(p: ReportParams, vendor_id?: string): Filters {
  const to = p.to ?? iso(Date.now())
  const from = p.from ?? iso(at(to) - 29 * DAY)
  if (from > to) throw new MedusaError(MedusaError.Types.INVALID_DATA, "from must be on or before to")
  return { from, to, ...(p.channel && { channel: p.channel }), ...(p.paid === "true" && { paid: true }), ...(vendor_id && { vendor_id }) }
}
/** Same-length range immediately before. */
export const previousOf = (f: Filters): Filters => {
  const n = (at(f.to) - at(f.from)) / DAY + 1
  return { ...f, from: iso(at(f.from) - n * DAY), to: iso(at(f.from) - DAY) }
}

const lines = (scope: MedusaContainer, f: Filters) =>
  db(scope)("report_line")
    .whereBetween("day", [f.from, f.to])
    .modify((q) => {
      if (f.vendor_id) q.where("vendor_id", f.vendor_id)
      if (f.channel) q.where("channel", f.channel)
      if (f.paid) q.where("paid", true)
    })

const SUMS = [
  "coalesce(sum(gross), 0) as revenue", "count(distinct order_id) as orders", "coalesce(sum(quantity), 0) as units",
  "coalesce(sum(commission), 0) as commission", "coalesce(sum(fee_share), 0) as fees",
]
const num = (r: Row) => ({
  revenue: major(cents(r.revenue)), orders: Number(r.orders), units: Number(r.units), commission: major(cents(r.commission)), fees: major(cents(r.fees)),
})
const aov = (t: { revenue: number; orders: number }) => (t.orders ? major(cents(t.revenue / t.orders)) : 0)

export async function totals(scope: MedusaContainer, f: Filters) {
  const [r] = await lines(scope, f).select(db(scope).raw([...SUMS, "count(distinct vendor_id) as vendors"].join(", ")))
  const t = num(r)
  return { ...t, aov: aov(t), vendors: Number(r.vendors) }
}

const BUCKET = {
  day: "day",
  week: "to_char(date_trunc('week', day::date), 'YYYY-MM-DD')",
  month: "to_char(date_trunc('month', day::date), 'YYYY-MM-DD')",
}
/** Every period of the range, zero-filled. Weeks start Monday. Default: day up to 62 days, else month. */
export async function series(scope: MedusaContainer, f: Filters, interval?: "day" | "week" | "month") {
  const iv = interval ?? ((at(f.to) - at(f.from)) / DAY + 1 <= 62 ? "day" : "month")
  const rows = await lines(scope, f)
    .select(db(scope).raw(`${BUCKET[iv]} as period, coalesce(sum(gross), 0) as revenue, count(distinct order_id) as orders`))
    .groupByRaw("1")
  const by = new Map<string, Row>(rows.map((r: Row) => [r.period, r]))
  const d = new Date(at(f.from))
  if (iv === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  if (iv === "month") d.setUTCDate(1)
  const out: { period: string; revenue: number; orders: number }[] = []
  for (; iso(+d) <= f.to; iv === "month" ? d.setUTCMonth(d.getUTCMonth() + 1) : d.setUTCDate(d.getUTCDate() + (iv === "week" ? 7 : 1))) {
    const r = by.get(iso(+d))
    out.push({ period: iso(+d), revenue: r ? major(cents(r.revenue)) : 0, orders: r ? Number(r.orders) : 0 })
  }
  return { interval: iv, series: out }
}

// Breakdown key per `by`. buyer = company, else customer, else the label (guest email).
const KEY: Record<string, string> = {
  product: "product_id", category: "category_id", country: "country_code", channel: "channel", buyer: "coalesce(company_id, customer_id, buyer_label)",
  vendor: "vendor_id", branch: "branch_id", branch_manager: "branch_manager_id", account_manager: "account_manager_id", broker: "broker_id",
}
export const VENDOR_BY = ["product", "category", "country", "channel", "buyer"] as const
export const ADMIN_BY = ["vendor", "branch", "branch_manager", "account_manager", "broker", "channel", "category", "country", "buyer"] as const

async function labels(scope: MedusaContainer, by: string, keys: string[]): Promise<Map<string, string>> {
  const pairs = (rows: Row[], f = "name") => new Map(rows.map((r) => [r.id as string, r[f] as string]))
  if (!keys.length) return new Map()
  if (by === "product") return pairs((await query(scope).graph({ entity: "product", fields: ["id", "title"], filters: { id: keys } })).data, "title")
  // ponytail: categories have no translations yet → `locale` falls back to the default name.
  if (by === "category") return pairs(await scope.resolve(Modules.PRODUCT).listProductCategories({ id: keys }, { select: ["id", "name"] }))
  if (by === "vendor") return pairs(await scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({ id: keys }, { select: ["id", "name"] }))
  if (by === "branch") return pairs(await salesOrgSvc(scope).listBranches({ id: keys }))
  if (["branch_manager", "account_manager", "broker"].includes(by)) return pairs(await salesOrgSvc(scope).listSalesReps({ id: keys }))
  if (by === "country") return new Map(keys.map((k) => [k, k.toUpperCase()]))
  return new Map(keys.map((k) => [k, k]))
}

/** All groups, sorted revenue desc then key (nulls last). Pagination is the caller's (CSV = all rows). */
export async function breakdown(scope: MedusaContainer, f: Filters, by: string) {
  const rows = (await lines(scope, f)
    .select(db(scope).raw([`${KEY[by]} as key`, "max(buyer_label) as buyer_label", ...SUMS].join(", ")))
    .groupByRaw("1")) as Row[]
  const names = await labels(scope, by, rows.map((r) => r.key).filter((k) => k != null))
  const total = rows.reduce((s, r) => s + cents(r.revenue), 0)
  const out = rows.map((r) => {
    const n = num(r)
    const label = r.key == null ? "Unassigned" : by === "buyer" ? r.buyer_label : (names.get(r.key) ?? r.key)
    return { key: r.key as string | null, label, ...n, share: total ? Math.round((cents(n.revenue) / total) * 10_000) / 10_000 : 0 }
  })
  out.sort((a, b) => b.revenue - a.revenue || (a.key == null ? 1 : b.key == null ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return out
}

/** UTF-8 + BOM (Excel shows Arabic), CRLF; text cells that start like a formula get a leading quote. */
export function sendCsv(res: MedusaResponse, filename: string, header: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v)
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  res.setHeader("content-type", "text/csv; charset=utf-8")
  res.setHeader("content-disposition", `attachment; filename="${filename}"`)
  res.send(`\uFEFF${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`)
}

// ---------- route handlers (vendor_id = scope to one vendor; null = admin) ----------

const OPEN_QUOTES = ["requested", "vendor_review", "offered", "negotiating", "pending_approval"]

export async function summaryHandler(scope: MedusaContainer, res: MedusaResponse, q: unknown, vendor_id: string | null) {
  const p = parse(ReportQuery, q)
  const f = filtersOf(p, vendor_id ?? undefined)
  const [cur, prev, { series: s }] = await Promise.all([totals(scope, f), totals(scope, previousOf(f)), series(scope, f, p.interval)])
  if (p.format === "csv") return sendCsv(res, `icommerce-summary-${f.from}-${f.to}.csv`, ["period", "revenue", "orders"], s.map((r) => [r.period, r.revenue, r.orders]))
  const range = { from: f.from, to: f.to }
  if (vendor_id) {
    const [, open_quotes] = await quoteSvc(scope).listAndCountQuotes({ vendor_id, status: OPEN_QUOTES as never }, { select: ["id"], take: 1 })
    return res.json({
      range,
      kpis: {
        revenue: cur.revenue, orders: cur.orders, aov: cur.aov, units: cur.units, commission: cur.commission, fee_share: cur.fees,
        net: major(cents(cur.revenue) - cents(cur.commission) - cents(cur.fees)), open_quotes, unread_chats: null,
      },
      previous: { revenue: prev.revenue, orders: prev.orders, aov: prev.aov, units: prev.units },
      series: s,
    })
  }
  const created = async (table: string) =>
    Number((await db(scope)(table).whereNull("deleted_at").where("created_at", ">=", f.from).where("created_at", "<", iso(at(f.to) + DAY)).count("* as n"))[0].n)
  res.json({
    range,
    kpis: {
      gmv: cur.revenue, orders: cur.orders, aov: cur.aov, units: cur.units, commission: cur.commission, fees: cur.fees,
      active_vendors: cur.vendors, new_vendors: await created("vendor"), new_companies: await created("company"),
    },
    previous: { gmv: prev.revenue, orders: prev.orders, aov: prev.aov, units: prev.units },
    series: s,
  })
}

export async function breakdownHandler(scope: MedusaContainer, res: MedusaResponse, q: unknown, vendor_id: string | null) {
  const p = parse(ReportQuery, q)
  const allowed: readonly string[] = vendor_id ? VENDOR_BY : ADMIN_BY
  const by = p.by ?? allowed[0]
  if (!allowed.includes(by)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `by must be one of ${allowed.join(", ")}`)
  const f = filtersOf(p, vendor_id ?? undefined)
  const all: Row[] = await breakdown(scope, f, by)
  const cols = ["key", "label", "revenue", "orders", "units", "share", ...(vendor_id ? [] : ["commission", "fees"])]
  if (p.format === "csv") return sendCsv(res, `icommerce-${by}-${f.from}-${f.to}.csv`, cols, all.map((r) => cols.map((c) => r[c])))
  const t = await totals(scope, f)
  res.json({
    by,
    rows: all.slice(p.offset, p.offset + p.limit).map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))),
    count: all.length,
    total: { revenue: t.revenue, orders: t.orders, units: t.units, ...(!vendor_id && { commission: t.commission, fees: t.fees }) },
  })
}
