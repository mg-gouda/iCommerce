import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createOrderPaymentCollectionWorkflow, createOrderWorkflow } from "@medusajs/medusa/core-flows"
import { QUOTE_MODULE } from "../modules/quote"
import type { QuoteStatus } from "../modules/quote/models/quote"
import type QuoteModuleService from "../modules/quote/service"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { BANK_PROVIDER, NET_TERMS_PROVIDER } from "../modules/offline-payment/service"
import { companyRecipients, companySvc, customerLocale, wholesaleChannelId } from "./company"
import { sendEmail } from "./emails"
import type { B2bTemplate } from "./emails-b2b"
import { feeOrderLine, resolveFee } from "./fees"
import { cents } from "./money"
import { assertNetTerms } from "./net-terms"
import { ensureVendorShipping, listVendorOptions } from "./vendor-shipping"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export type Party = "buyer" | "vendor"

export const quoteSvc = (scope: MedusaContainer): QuoteModuleService => scope.resolve(QUOTE_MODULE)
export const quoteRef = (q: Row) => `Q-${q.id.slice(-6).toUpperCase()}`
const num = (n: unknown) => (n == null ? null : Number(n))
export const bad = (msg: string) => new MedusaError(MedusaError.Types.INVALID_DATA, msg)

/** Quote with items + messages, scoped to a company or a vendor. Anything else → 404. */
export async function getQuoteOr404(scope: MedusaContainer, id: string, owner: { company_id: string } | { vendor_id: string }) {
  const [q] = await quoteSvc(scope).listQuotes({ id, ...owner }, { relations: ["items", "messages"] })
  if (!q) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Quote with id "${id}" not found`)
  return q as Row
}

/** API shape: company / vendor / requester summaries resolved in bulk. */
export async function shapeQuotes(scope: MedusaContainer, quotes: Row[], withMessages = false) {
  if (!quotes.length) return []
  const cs = companySvc(scope)
  const companies = new Map((await cs.listCompanies({ id: [...new Set(quotes.map((q) => q.company_id))] })).map((c) => [c.id, c]))
  const members = new Map((await cs.listCompanyMembers({ id: [...new Set(quotes.map((q) => q.requester_id))] })).map((m) => [m.id, m]))
  const vendorSvc: VendorModuleService = scope.resolve(VENDOR_MODULE)
  const vendors = new Map((await vendorSvc.listVendors({ id: [...new Set(quotes.map((q) => q.vendor_id))] })).map((v) => [v.id, v]))
  return quotes.map((q) => {
    const c = companies.get(q.company_id)
    const v = vendors.get(q.vendor_id)
    const m = members.get(q.requester_id)
    return {
      id: q.id, rfq_id: q.rfq_id, status: q.status as QuoteStatus, currency_code: q.currency_code,
      company: c ? { id: c.id, name: c.name, country: c.country, city: c.city } : null,
      vendor: v ? { id: v.id, name: v.name, handle: v.handle } : null,
      requester: m ? { id: m.id, email: m.email, first_name: m.first_name, last_name: m.last_name } : null,
      notes: q.notes, incoterm: q.incoterm, validity_until: q.validity_until, total: num(q.total),
      order_id: q.order_id, approved_by: q.approved_by,
      items: ((q.items ?? []) as Row[])
        .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
        .map((i) => ({
          id: i.id, product_id: i.product_id, variant_id: i.variant_id, title: i.title, quantity: Number(i.quantity), unit: i.unit,
          target_price: num(i.target_price), offered_unit_price: num(i.offered_unit_price), lead_time_days: i.lead_time_days,
        })),
      ...(withMessages && {
        messages: ((q.messages ?? []) as Row[])
          .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
          .map((m) => ({ id: m.id, author: m.author, author_name: m.author_name, body: m.body, created_at: m.created_at })),
      }),
      created_at: q.created_at, updated_at: q.updated_at,
    }
  })
}

/** Guards a transition: current status must be one of `from`. */
export function need(q: Row, from: QuoteStatus[], action: string) {
  if (!from.includes(q.status)) throw bad(`Quote is ${q.status}; cannot ${action}.`)
}

/**
 * Status change + thread entries. System message body = event code (requested, viewed, offered, countered,
 * pending_approval, approved, ordered, rejected, expired) so clients can translate it.
 */
export async function transition(
  scope: MedusaContainer,
  q: Row,
  patch: Row & { status?: QuoteStatus },
  event: string | null,
  message?: { author: Party; author_name?: string | null; body?: string | null },
) {
  const svc = quoteSvc(scope)
  await svc.updateQuotes({ id: q.id, ...patch })
  if (message?.body) await svc.createQuoteMessages({ quote_id: q.id, author: message.author, author_name: message.author_name ?? null, body: message.body })
  if (event) await svc.createQuoteMessages({ quote_id: q.id, author: "system", body: event })
}

async function vendorRecipient(scope: MedusaContainer, vendor_id: string) {
  const vendor = await (scope.resolve(VENDOR_MODULE) as VendorModuleService).retrieveVendor(vendor_id, { relations: ["users"] })
  return vendor.users?.find((u) => u.role === "owner")?.email ?? vendor.email
}

/** Emails `to` about a quote event. Recipients: vendor owner / requester / approvers+admins. */
export async function notify(
  scope: MedusaContainer,
  q: Row,
  template: B2bTemplate,
  to: ("vendor" | "requester" | "approvers")[],
  extra: { body?: string | null; note?: string | null } = {},
) {
  const company = await companySvc(scope).retrieveCompany(q.company_id)
  const data = { display_id: "", currency_code: q.currency_code, ref: quoteRef(q), company_name: company.name, ...extra }
  const list: { email?: string | null; locale?: unknown }[] = []
  if (to.includes("vendor")) list.push({ email: await vendorRecipient(scope, q.vendor_id) })
  if (to.includes("requester")) {
    const [m] = await companySvc(scope).listCompanyMembers({ id: q.requester_id })
    if (m) list.push({ email: m.email, locale: await customerLocale(scope, m.customer_id) })
  }
  if (to.includes("approvers")) list.push(...(await companyRecipients(scope, q.company_id, ["approver", "admin"])))
  const stamp = Date.now()
  for (const r of list) {
    await sendEmail(scope, { to: r.email, template, locale: r.locale, data, key: `${template}-${q.id}-${r.email}-${stamp}` })
  }
}

/**
 * Accepted quote → parent order (Wholesale channel, offered prices, exact decimal quantities, company address)
 * + payment (net terms or bank transfer) → `order.placed`, so the P2 split creates the vendor order and sends emails.
 */
export async function placeQuoteOrder(scope: MedusaContainer, q: Row) {
  const company = await companySvc(scope).retrieveCompany(q.company_id)
  const total = (q.items as Row[]).reduce((s, i) => s + Number(i.quantity) * Number(i.offered_unit_price), 0)
  // P4: platform fee (b2b tiers, company's monthly volume) as its own parent-order line, snapshot in metadata.
  const fee = await resolveFee(scope, { channel: "b2b", customer_id: q.customer_id, subtotal: cents(total) })
  const net = company.payment_mode === "net_terms"
  if (net) await assertNetTerms(scope, q.customer_id, total + (fee?.amount ?? 0))
  const [customer] = await scope.resolve(Modules.CUSTOMER).listCustomers({ id: q.customer_id }, { select: ["id", "email", "first_name", "last_name"] })

  const address = {
    first_name: customer?.first_name ?? "", last_name: customer?.last_name ?? "", company: company.name,
    address_1: company.address ?? "", city: company.city ?? "", country_code: company.country.toLowerCase(), phone: company.phone ?? "",
  }
  // Vendor fulfils through one of its shipping options (price 0: delivery is part of the offer / incoterm).
  // ponytail: a vendor without any shipping option gets an order it can't mark shipped until it adds one.
  const vendor = await (scope.resolve(VENDOR_MODULE) as VendorModuleService).retrieveVendor(q.vendor_id)
  const [option] = await listVendorOptions(scope, (await ensureVendorShipping(scope, vendor)).shipping_profile_id)
  const { result: order } = await createOrderWorkflow(scope).run({
    input: {
      customer_id: q.customer_id,
      email: customer?.email,
      sales_channel_id: await wholesaleChannelId(scope),
      currency_code: q.currency_code,
      shipping_address: address,
      billing_address: address,
      metadata: { quote_id: q.id, rfq_id: q.rfq_id, company_id: q.company_id },
      shipping_methods: option
        ? [{ name: `Delivery as quoted${q.incoterm ? ` (${q.incoterm})` : ""}`, amount: 0, shipping_option_id: option.id, data: {} }]
        : [],
      items: (q.items as Row[]).map((i) => ({
        title: i.title,
        ...(i.variant_id && { variant_id: i.variant_id }),
        ...(i.product_id && { product_id: i.product_id }),
        quantity: Number(i.quantity),
        unit_price: Number(i.offered_unit_price),
        is_tax_inclusive: false,
        requires_shipping: !!option,
        metadata: { quote_id: q.id, quote_item_id: i.id, vendor_id: q.vendor_id, unit: i.unit },
      })).concat(fee ? [feeOrderLine(fee) as never] : []),
    } as never,
  })

  const { data: [o] } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "order", fields: ["id", "total"], filters: { id: order.id } })
  const amount = Number(o.total)
  const { result: [pc] } = await createOrderPaymentCollectionWorkflow(scope).run({ input: { order_id: order.id, amount } })
  const payment = scope.resolve(Modules.PAYMENT)
  const session = await payment.createPaymentSession(pc.id, {
    provider_id: net ? NET_TERMS_PROVIDER : BANK_PROVIDER, currency_code: q.currency_code, amount, data: {},
  })
  await payment.authorizePaymentSession(session.id, {})
  await scope.resolve(Modules.EVENT_BUS).emit({ name: "order.placed", data: { id: order.id } })
  return order.id
}

/** Accepted (by an approver/admin, or nobody needs to approve) → order → `ordered` + emails. */
export async function acceptAndOrder(scope: MedusaContainer, q: Row, patch: Row = {}) {
  if (q.validity_until && new Date(q.validity_until) < new Date()) throw bad("Offer expired.")
  const order_id = await placeQuoteOrder(scope, q)
  await transition(scope, q, { ...patch, status: "ordered", order_id }, "ordered")
  await notify(scope, q, "quote-accepted", ["vendor", "requester"])
}

/** Hourly job: offers past validity → expired. */
export async function expireQuotes(scope: MedusaContainer) {
  const due = await quoteSvc(scope).listQuotes({ status: ["offered", "pending_approval"], validity_until: { $lt: new Date() } })
  for (const q of due) {
    await transition(scope, q, { status: "expired" }, "expired")
    await notify(scope, q, "quote-expired", ["requester", "vendor"])
  }
  return due.length
}
