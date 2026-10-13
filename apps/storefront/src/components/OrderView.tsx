import { CircleCheck, ExternalLink, Package, Truck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { orderPayment, orderStatusOrNull, payKind, type OrderPay, type OrderStatus, type VendorOrder } from "@/lib/checkout"
import { AddressLines } from "./AddressLines"
import type { Order } from "@/lib/session"
import { ProofForm, ReturnForm } from "./OrderForms"
import { VendorLines } from "./VendorLines"

type T = Awaited<ReturnType<typeof getTranslations<"order">>>
const STATUS_BADGE = { pending: "neutral", shipped: "neutral", delivered: "success", canceled: "danger" } as const
// Badge carries icons for success/danger; neutral states get theirs here (status is never colour alone).
const STATUS_ICON = { pending: Package, shipped: Truck, delivered: null, canceled: null }

/** Status by order number + email. Right after checkout the vendor split runs async (seconds with the Redis event bus) → retry up to ~6 s while empty. */
async function loadStatus(order: Order) {
  const fresh = Date.now() - new Date(order.created_at).getTime() < 2 * 60 * 1000
  for (let i = 0; ; i++) {
    const s = await orderStatusOrNull(order.display_id ?? "", order.email ?? "")
    if (!s || s.vendor_orders.length || !fresh || i >= 12) return s
    await new Promise((r) => setTimeout(r, 500))
  }
}

/** Order page body (confirmation + account detail): per-vendor shipments, payment instructions, totals. */
export async function OrderView({ order, signedIn }: { order: Order; signedIn: boolean }) {
  const [t, locale, status] = await Promise.all([getTranslations("order"), getLocale(), loadStatus(order)])
  const currency = order.currency_code.toUpperCase()
  const a = order.shipping_address
  // Returns are customer-only: delivered vendor orders with no open request (one open request per vendor order).
  const open = new Set(
    signedIn
      ? status?.vendor_orders
          .filter((v) => v.status === "delivered" && (!v.return_request || v.return_request.status === "rejected"))
          .flatMap((v) => v.items.map((i) => i.parent_item_id))
      : []
  )
  const returnable = (order.items ?? []).filter((i) => open.has(i.id))
  const fallback = orderPayment(order)

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("shipments")}</h2>
        <p className="m-0 text-[14px] text-ink-muted">{t("shipNote")}</p>
        {status?.vendor_orders.length ? (
          <Shipments status={status} t={t} />
        ) : (
          // Split not visible yet (or lookup rate-limited): plain lines.
          <div className="rounded-lg border border-line bg-surface p-4 md:p-6">
            <VendorLines groups={[{ vendor: null, items: order.items ?? [] }]} currency={currency} />
          </div>
        )}

        {returnable.length > 0 && (
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-6">
            <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("returnTitle")}</h2>
            <p className="m-0 text-[14px] text-ink-muted">{t("returnHelp")}</p>
            <ReturnForm
              orderId={order.id}
              items={returnable.map((i) => ({ id: i.id, title: i.product_title ?? i.title, quantity: i.quantity }))}
            />
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        <PaymentPanel
          t={t}
          n={order.display_id ?? 0}
          email={order.email ?? ""}
          total={money(order.total, currency)}
          payment={status?.payment}
          fallback={{ kind: fallback.kind, bank: fallback.bank }}
        />

        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5">
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("summary")}</h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[14px] tabular-nums">
            <dt className="text-ink-muted">{t("subtotal")}</dt>
            <dd className="m-0"><bdi>{money(order.item_subtotal ?? 0, currency)}</bdi></dd>
            <dt className="text-ink-muted">{t("shipping")}</dt>
            <dd className="m-0"><bdi>{money(order.shipping_total ?? 0, currency)}</bdi></dd>
            <dt className="font-semibold">{t("total")}</dt>
            <dd className="m-0 font-semibold"><bdi>{money(order.total, currency)}</bdi></dd>
          </dl>
        </section>

        {a && (
          <section className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-5 text-[14px]">
            <h2 className="m-0 mb-1 text-[16px] leading-[22px] font-semibold">{t("deliverTo")}</h2>
            <AddressLines a={a} locale={locale} />
          </section>
        )}
      </aside>
    </div>
  )
}

/** Payment method + what to do next. Bank transfer awaiting confirmation → bank details + receipt upload. */
export function PaymentPanel({ t, n, email, total, payment, fallback }: {
  t: T
  n: number
  email: string
  total: string
  payment?: OrderPay | null
  fallback?: { kind?: "cod" | "bank"; bank: string | null }
}) {
  const kind = (payment && payKind(payment.provider_id)) ?? fallback?.kind
  const bank = payment?.bank_details || fallback?.bank
  const awaiting = !payment || payment.status === "authorized"
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5">
      <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("payment")}</h2>
      <p className="m-0 font-medium">{t(`pay.${kind === "bank" ? "bank" : "cod"}`)}</p>
      {kind !== "bank" ? (
        <p className="m-0 text-[14px] text-ink-muted">{t("codHow")}</p>
      ) : payment?.status === "canceled" ? (
        <p className="m-0 text-[14px] text-ink-muted">{t("payCanceled")}</p>
      ) : !awaiting ? (
        <p role="status" className="m-0 flex items-center gap-1.5 text-[14px] text-success">
          <CircleCheck size={16} aria-hidden /> {t("payConfirmed")}
        </p>
      ) : (
        <>
          <p className="m-0 text-[14px] text-ink-muted">{t("bankHow", { n, total })}</p>
          {bank ? (
            <pre dir="auto" className="m-0 rounded-md bg-ground p-3 font-[inherit] text-[14px] whitespace-pre-wrap">{bank}</pre>
          ) : (
            <p className="m-0 text-[14px] text-ink-muted">{t("bankByEmail")}</p>
          )}
          {payment?.proof_uploaded_at && <Badge variant="success">{t("proofReceived")}</Badge>}
          {payment && <ProofForm n={n} email={email} replace={!!payment.proof_uploaded_at} />}
        </>
      )}
    </section>
  )
}

export function Shipments({ status, t }: { status: OrderStatus; t: T }) {
  const currency = status.order.currency_code.toUpperCase()
  return status.vendor_orders.map((v) => <Shipment key={v.id} v={v} currency={currency} t={t} />)
}

function Shipment({ v, currency, t }: { v: VendorOrder; currency: string; t: T }) {
  const Icon = STATUS_ICON[v.status]
  const f = v.fulfillment
  return (
    <section aria-label={v.vendor.name} className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ground px-4 py-3">
        <Link href={`/v/${v.vendor.handle}`} className="font-semibold text-ink no-underline hover:underline">{v.vendor.name}</Link>
        <Badge variant={STATUS_BADGE[v.status]}>
          {Icon && <Icon aria-hidden />} {t(`status.${v.status}`)}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 p-4 text-[14px]">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {v.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span dir="auto" className="text-start">{i.title} <span className="text-ink-muted">× <bdi>{i.quantity}</bdi></span></span>
              <bdi className="tabular-nums">{money(i.unit_price * i.quantity, currency)}</bdi>
            </li>
          ))}
        </ul>
        {v.shipping_method && (
          <p className="m-0 text-ink-muted"><bdi>{v.shipping_method.name}</bdi> · <bdi>{money(v.shipping_method.amount, currency)}</bdi></p>
        )}
        {v.status === "canceled" && v.cancel_reason && (
          <p className="m-0 text-ink-muted">{t("canceledBecause", { reason: v.cancel_reason })}</p>
        )}
        {f && (
          <p className="m-0">
            {t("trackingLine", { carrier: f.carrier })} <bdi dir="ltr" className="ic-mono">{f.tracking_number}</bdi>
            {f.tracking_url && (
              <>
                {" · "}
                <a href={f.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-ink underline underline-offset-2">
                  {t("track")} <ExternalLink size={14} aria-hidden />
                  <span className="sr-only">{t("newTab")}</span>
                </a>
              </>
            )}
          </p>
        )}
        {v.return_request && <p className="m-0 text-ink-muted">{t(`return.${v.return_request.status}`)}</p>}
      </div>
    </section>
  )
}
