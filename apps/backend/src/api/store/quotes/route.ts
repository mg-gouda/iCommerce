import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import VendorProductLink from "../../../links/vendor-product"
import { callerMembership } from "../../../lib/company"
import { listQuery, money, parse, qty } from "../../../lib/parse"
import { bad, notify, quoteSvc, shapeQuotes } from "../../../lib/quotes"
import { QUOTE_STATUSES } from "../../../modules/quote/models/quote"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const Item = z
  .object({
    variant_id: z.string().optional(),
    product_id: z.string().optional(),
    vendor_id: z.string().optional(),
    find_suppliers: z.literal(true).optional(), // free text: iCommerce staff pick the vendors
    title: z.string().trim().min(1).max(300).optional(),
    quantity: qty,
    unit: z.string().trim().max(30).optional(),
    target_price: money.optional(),
  })
  .strict()
  .refine(
    (i) => i.variant_id || i.product_id || (i.title && !!i.vendor_id !== !!i.find_suppliers),
    "each item needs variant_id/product_id, or title + one of vendor_id / find_suppliers",
  )
const Create = z
  .object({ items: z.array(Item).min(1).max(50), notes: z.string().trim().max(2000).optional(), incoterm: z.string().trim().max(20).optional() })
  .strict()
const List = z.object({ status: z.enum(QUOTE_STATUSES).optional(), rfq_id: z.string().optional(), ...listQuery })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { status, rfq_id, limit, offset } = parse(List, req.query)
  const { company } = await callerMembership(req)
  const [quotes, count] = await quoteSvc(req.scope).listAndCountQuotes(
    // `routed` = staff already split it into vendor quotes → hidden unless asked for.
    { company_id: company.id, status: status ?? { $ne: "routed" }, ...(rfq_id && { rfq_id }) },
    { relations: ["items"], order: { created_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ quotes: await shapeQuotes(req.scope, quotes), count, limit, offset })
}

// RFQ: items grouped by vendor → one quote per vendor, sharing rfq_id. `find_suppliers` lines → one vendor-less `routing` quote.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(Create, req.body)
  const { company, member } = await callerMembership(req)
  if (company.kyc_status !== "verified") throw bad("Company must be verified to request quotes.")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Catalog lines: resolve variant (product → first variant), title, unit, vendor.
  const productIds = body.items.filter((i) => !i.variant_id && i.product_id).map((i) => i.product_id!)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "product_id", "product.title", "product.product_extra.unit", "created_at"],
    filters: { $or: [{ id: body.items.map((i) => i.variant_id).filter(Boolean) as string[] }, { product_id: productIds }] },
  })
  const { data: links } = await query.graph({
    entity: VendorProductLink.entryPoint,
    fields: ["vendor_id", "product_id"],
    filters: { product_id: [...new Set((variants as Row[]).map((v) => v.product_id))] },
  })
  const vendorOf = new Map((links as Row[]).map((l) => [l.product_id, l.vendor_id as string]))
  const vendorSvc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const vendors = new Map(
    (await vendorSvc.listVendors({ id: body.items.map((i) => i.vendor_id).filter(Boolean) as string[], status: "approved" })).map((v) => [v.id, v]),
  )

  const lines = body.items.map((i) => {
    const v = (variants as Row[])
      .filter((x) => (i.variant_id ? x.id === i.variant_id : x.product_id === i.product_id))
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))[0]
    if (i.variant_id || i.product_id) {
      if (!v || !vendorOf.has(v.product_id)) throw bad(`Unknown product ${i.variant_id ?? i.product_id}.`)
      const title = i.title ?? [v.product?.title, v.title !== "Default" ? v.title : null].filter(Boolean).join(" · ")
      return { vendor_id: vendorOf.get(v.product_id)!, item: { product_id: v.product_id, variant_id: v.id, title, quantity: i.quantity, unit: i.unit ?? v.product?.product_extra?.unit ?? null, target_price: i.target_price ?? null } }
    }
    if (i.find_suppliers) return { vendor_id: null, item: { product_id: null, variant_id: null, title: i.title!, quantity: i.quantity, unit: i.unit ?? null, target_price: i.target_price ?? null } }
    if (!vendors.has(i.vendor_id!)) throw bad(`Unknown vendor ${i.vendor_id}.`)
    return { vendor_id: i.vendor_id!, item: { product_id: null, variant_id: null, title: i.title!, quantity: i.quantity, unit: i.unit ?? null, target_price: i.target_price ?? null } }
  })

  const rfq_id = generateEntityId("", "rfq")
  const svc = quoteSvc(req.scope)
  const ids: string[] = []
  for (const vendor_id of [...new Set(lines.map((l) => l.vendor_id))]) {
    const q = await svc.createQuotes({
      rfq_id, company_id: company.id, requester_id: member.id, customer_id: member.customer_id, vendor_id,
      status: vendor_id ? "requested" : "routing", notes: body.notes ?? null, incoterm: body.incoterm ?? null,
    })
    await svc.createQuoteItems(lines.filter((l) => l.vendor_id === vendor_id).map((l) => ({ ...l.item, quote_id: q.id })))
    await svc.createQuoteMessages({ quote_id: q.id, author: "system", body: vendor_id ? "requested" : "routing" })
    ids.push(q.id)
    if (vendor_id) await notify(req.scope, q, "quote-requested", ["vendor"], { body: body.notes })
  }
  const quotes = await svc.listQuotes({ id: ids }, { relations: ["items", "messages"] })
  res.status(201).json({ rfq_id, quotes: await shapeQuotes(req.scope, quotes, true) })
}
