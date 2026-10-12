import { ExternalLink, Package, Truck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { orderPayment, vendorOrders, type VendorOrder } from "@/lib/checkout"
import { governorate } from "@/lib/governorates"
import type { Order } from "@/lib/session"
import { byVendor, productsById } from "@/lib/store"
import { ProofForm, ReturnForm } from "./OrderForms"
import { VendorLines } from "./VendorLines"

const STATUS_BADGE = { pending: "neutral", shipped: "neutral", delivered: "success", canceled: "danger" } as const
// Badge carries icons for success/danger; neutral states get theirs here (status is never colour alone).
const STATUS_ICON = { pending: Package, shipped: Truck, delivered: null, canceled: null }

/** Order page body (confirmation + account detail): per-vendor shipments, payment instructions, totals. */
export async function OrderView({ order, signedIn }: { order: Order; signedIn: boolean }) {
  const [t, locale] = await Promise.all([getTranslations("order"), getLocale()])
  const currency = order.currency_code.toUpperCase()
  const pay = orderPayment(order)
  const split = signedIn ? await vendorOrders(order.id) : null
  const bank = split?.payment.bank_details ?? pay.bank
  const a = order.shipping_address

  let shipments
  if (split?.vendor_orders.length) {
    shipments = split.vendor_orders.map((v) => <Shipment key={v.id} v={v} currency={currency} t={t} />)
  } else {
    // Guest (vendor-orders needs an account) or split not done yet: group lines by product vendor.
    const products = await productsById(order.items?.map((i) => i.product_id) ?? [])
    const methodOf = (handle?: string) =>
      order.shipping_methods?.find((m) => (m.data as { vendor_handle?: string } | null)?.vendor_handle === (handle ?? ""))
    shipments = (
      <div className="rounded-lg border border-line bg-surface p-4 md:p-6">
        <VendorLines
          groups={byVendor(order.items ?? [], products)}
          currency={currency}
          extra={(v) => {
            const m = methodOf(v?.handle)
            return m && <p className="m-0 text-[13px] text-ink-muted">{m.name} · <bdi>{money(m.amount, currency)}</bdi></p>
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("shipments")}</h2>
        <p className="m-0 text-[14px] text-ink-muted">{t("shipNote")}</p>
        {shipments}

        {split?.vendor_orders.some((v) => v.status === "delivered") && (
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-6">
            <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("returnTitle")}</h2>
            <p className="m-0 text-[14px] text-ink-muted">{t("returnHelp")}</p>
            <ReturnForm
              orderId={order.id}
              items={(order.items ?? []).map((i) => ({ id: i.id, title: i.product_title ?? i.title, quantity: i.quantity }))}
            />
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5">
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("payment")}</h2>
          <p className="m-0 font-medium">{t(`pay.${pay.kind === "bank" ? "bank" : "cod"}`)}</p>
          {pay.kind === "bank" ? (
            <>
              <p className="m-0 text-[14px] text-ink-muted">{t("bankHow", { n: order.display_id ?? "", total: money(order.total, currency) })}</p>
              {bank ? (
                <pre dir="auto" className="m-0 rounded-md bg-ground p-3 font-[inherit] text-[14px] whitespace-pre-wrap">{bank}</pre>
              ) : (
                <p className="m-0 text-[14px] text-ink-muted">{t("bankByEmail")}</p>
              )}
              {split?.payment.proof_uploaded_at && <Badge variant="success">{t("proofReceived")}</Badge>}
              {signedIn ? (
                <ProofForm orderId={order.id} />
              ) : (
                <p className="m-0 text-[14px] text-ink-muted">{t("proofGuest")}</p>
              )}
            </>
          ) : (
            <p className="m-0 text-[14px] text-ink-muted">{t("codHow")}</p>
          )}
        </section>

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
            <span>{a.first_name} {a.last_name}</span>
            <span>{[a.address_1, a.address_2].filter(Boolean).join(", ")}</span>
            <span>{a.city}, {governorate(a.province, locale)}</span>
            <bdi dir="ltr" className="text-start">{a.phone}</bdi>
          </section>
        )}
      </aside>
    </div>
  )
}

function Shipment({ v, currency, t }: { v: VendorOrder; currency: string; t: Awaited<ReturnType<typeof getTranslations<"order">>> }) {
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
          <p className="m-0 text-ink-muted">{v.shipping_method.name} · <bdi>{money(v.shipping_method.amount, currency)}</bdi></p>
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
