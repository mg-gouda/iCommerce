import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { B2B_STR, type B2bData, type B2bTemplate } from "./emails-b2b"

export type Locale = "en" | "ar"
type Item = { title: string; quantity: number; total: number }
export type EmailData = {
  display_id: number | string
  currency_code: string
  total?: number
  items?: Item[]
  vendor_name?: string
  bank_details?: string
  carrier?: string
  tracking_number?: string
  tracking_url?: string | null
  reason?: string
  /** Order-canceled refund note: COD → nothing was charged; bank → support contacts the buyer. */
  refund?: "cod" | "bank"
} & B2bData

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const money = (n: number | undefined, cur: string, l: Locale) =>
  new Intl.NumberFormat(l === "ar" ? "ar-EG" : "en-US", { style: "currency", currency: cur.toUpperCase() }).format(n ?? 0)

const STR = {
  en: {
    hello: "Hello,",
    view: "View your order",
    team: "The iCommerce team",
    item: "Item", qty: "Qty", total: "Total",
    "order-placed": { subject: (d: EmailData) => `Order #${d.display_id} confirmed`, intro: "Thanks for your order. Each seller ships their items separately; we'll email you as they go out." },
    "bank-transfer": { subject: (d: EmailData) => `Pay order #${d.display_id} by bank transfer`, intro: "Please transfer the order total to the account below, then upload the transfer receipt from your order page. Sellers ship once we confirm the payment." },
    "vendor-new-order": { subject: (d: EmailData) => `New order #${d.display_id}`, intro: "You have a new order. Open the vendor portal to prepare and ship it." },
    "order-shipped": { subject: (d: EmailData) => `Order #${d.display_id} has shipped`, intro: "Good news: part of your order is on its way." },
    "order-delivered": { subject: (d: EmailData) => `Order #${d.display_id} delivered`, intro: "Your items were delivered. Something wrong? You can request a return from your order page." },
    "order-canceled": { subject: (d: EmailData) => `Order #${d.display_id}: items cancelled by the seller`, intro: "Sorry, the seller below cancelled these items from your order. Items from other sellers are not affected." },
    reason: "Reason",
    refund: {
      cod: "You chose cash on delivery, so nothing was charged for these items.",
      bank: "You chose bank transfer. iCommerce support will contact you about your refund.",
    },
    seller: "Seller", carrier: "Carrier", tracking: "Tracking number", track: "Track shipment", amount: "Amount", bank: "Bank details",
  },
  ar: {
    hello: "مرحبًا،",
    view: "عرض طلبك",
    team: "فريق iCommerce",
    item: "المنتج", qty: "الكمية", total: "الإجمالي",
    "order-placed": { subject: (d: EmailData) => `تم تأكيد الطلب رقم ${d.display_id}`, intro: "شكرًا لطلبك. يشحن كل بائع منتجاته بشكل منفصل، وسنراسلك عند شحن كل جزء." },
    "bank-transfer": { subject: (d: EmailData) => `ادفع الطلب رقم ${d.display_id} بالتحويل البنكي`, intro: "يرجى تحويل إجمالي الطلب إلى الحساب التالي، ثم رفع إيصال التحويل من صفحة الطلب. يبدأ الشحن بعد تأكيد الدفع." },
    "vendor-new-order": { subject: (d: EmailData) => `طلب جديد رقم ${d.display_id}`, intro: "لديك طلب جديد. افتح بوابة البائع لتجهيزه وشحنه." },
    "order-shipped": { subject: (d: EmailData) => `تم شحن الطلب رقم ${d.display_id}`, intro: "خبر سار: جزء من طلبك في الطريق إليك." },
    "order-delivered": { subject: (d: EmailData) => `تم توصيل الطلب رقم ${d.display_id}`, intro: "تم توصيل منتجاتك. هل هناك مشكلة؟ يمكنك طلب إرجاع من صفحة الطلب." },
    "order-canceled": { subject: (d: EmailData) => `الطلب رقم ${d.display_id}: ألغى البائع بعض المنتجات`, intro: "نأسف، ألغى البائع التالي هذه المنتجات من طلبك. لا يتأثر ما طلبته من بائعين آخرين." },
    reason: "السبب",
    refund: {
      cod: "اخترت الدفع عند الاستلام، لذلك لم يُخصم منك أي مبلغ مقابل هذه المنتجات.",
      bank: "اخترت التحويل البنكي. سيتواصل معك فريق دعم iCommerce بشأن استرداد المبلغ.",
    },
    seller: "البائع", carrier: "شركة الشحن", tracking: "رقم التتبع", track: "تتبع الشحنة", amount: "المبلغ", bank: "بيانات الحساب البنكي",
  },
}
export type Template = "order-placed" | "bank-transfer" | "vendor-new-order" | "order-shipped" | "order-delivered" | "order-canceled" | B2bTemplate

export function render(template: Template, d: EmailData, l: Locale) {
  const s = { ...STR[l], ...B2B_STR[l] }
  const row = (k: string, v: string) => `<p style="margin:4px 0"><b>${esc(k)}:</b> <bdi>${v}</bdi></p>`
  const table = d.items?.length
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
<tr style="background:#f3f5f9"><th style="padding:8px;text-align:start">${s.item}</th><th style="padding:8px">${s.qty}</th><th style="padding:8px;text-align:end">${s.total}</th></tr>
${d.items.map((i) => `<tr><td style="padding:8px;border-top:1px solid #e3e7ee">${esc(i.title)}</td><td style="padding:8px;border-top:1px solid #e3e7ee;text-align:center">${i.quantity}</td><td style="padding:8px;border-top:1px solid #e3e7ee;text-align:end"><bdi>${money(i.total, d.currency_code, l)}</bdi></td></tr>`).join("\n")}
</table>`
    : ""
  const body = [
    d.vendor_name && row(s.seller, esc(d.vendor_name)),
    table,
    d.total != null && row(s.total, money(d.total, d.currency_code, l)),
    d.bank_details && `${row(s.amount, money(d.total, d.currency_code, l))}<p style="margin:12px 0 4px"><b>${s.bank}:</b></p><pre style="white-space:pre-wrap;background:#f3f5f9;padding:12px;border-radius:6px;font-family:inherit" dir="ltr">${esc(d.bank_details)}</pre>`,
    d.reason && row(s.reason, esc(d.reason)),
    d.refund && `<p style="margin:16px 0 0">${s.refund[d.refund]}</p>`,
    d.carrier && row(s.carrier, esc(d.carrier)),
    d.tracking_number && row(s.tracking, esc(d.tracking_number)),
    d.tracking_url && `<p style="margin:16px 0"><a href="${esc(d.tracking_url)}" style="background:#2a74ba;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${s.track}</a></p>`,
    d.company_name && row(s.company, esc(d.company_name)),
    d.body && `<p style="margin:12px 0 4px"><b>${s.message}:</b></p><blockquote style="margin:0;white-space:pre-wrap;background:#f3f5f9;padding:12px;border-radius:6px">${esc(d.body)}</blockquote>`,
    d.note && row(s.note, esc(d.note)),
    d.due_date && row(s.due, esc(d.due_date)),
    d.url && `<p style="margin:16px 0"><a href="${esc(d.url)}" style="background:#2a74ba;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${template === "company-invite" ? s.accept : s.open}</a></p>`,
    // Buyer emails link to the order tracking page (works for guests: order number + email). Needs STOREFRONT_URL.
    // B2B templates (quote-/company-/invoice-) carry their own links.
    (template.startsWith("order-") || template === "bank-transfer") && process.env.STOREFRONT_URL &&
      `<p style="margin:16px 0"><a href="${esc(`${process.env.STOREFRONT_URL.replace(/\/$/, "")}/${l}/track`)}" style="color:#22609c">${s.view}</a></p>`,
  ]
    .filter(Boolean)
    .join("\n")
  const t = s[template]
  const html = `<!doctype html><html lang="${l}" dir="${l === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(t.subject(d))}</title></head>
<body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#1c1952">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#1c1952;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;font-size:20px;font-weight:bold">iCommerce</div>
<div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;line-height:1.5">
<h1 style="font-size:20px;margin:0 0 12px">${esc(t.subject(d))}</h1>
<p style="margin:0 0 8px">${s.hello}</p><p style="margin:0 0 16px">${t.intro}</p>
${body}
<p style="margin:24px 0 0;color:#5b6475">${s.team}</p>
</div></div></body></html>`
  return { subject: t.subject(d), html }
}

/**
 * Renders + sends one email through the Notification module (channel "email").
 * Never throws: email trouble must not fail an order action; failures are logged.
 */
export async function sendEmail(
  container: MedusaContainer,
  m: { to?: string | null; template: Template; data: EmailData; locale?: unknown; key: string },
) {
  if (!m.to) return
  const locale: Locale = m.locale === "ar" ? "ar" : "en"
  try {
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: m.to,
      channel: "email",
      template: m.template,
      data: { ...m.data, locale },
      content: render(m.template, m.data, locale),
      idempotency_key: m.key,
    })
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`email ${m.template} → ${m.to} failed: ${(e as Error).message}`)
  }
}
