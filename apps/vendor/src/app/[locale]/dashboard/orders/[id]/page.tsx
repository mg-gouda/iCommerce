import Image from "next/image"
import { notFound } from "next/navigation"
import { ExternalLink } from "lucide-react"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { CancelForm, DeliverButton, FulfilForm, ReturnDecision } from "@/components/OrderActions"
import { PageHeader, panel } from "@/components/PageHeader"
import { Link } from "@/i18n/navigation"
import { ApiError, vendorApi } from "@/lib/api"
import { orderBadge, payMethod } from "@/lib/status"
import type { VendorOrder } from "@/lib/types"

const h2 = "m-0 mb-3 text-[16px] leading-[22px] font-semibold"

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations("orders")
  const format = await getFormatter()
  const locale = await getLocale()
  const o = await vendorApi<{ order: VendorOrder }>(`/vendors/orders/${encodeURIComponent(id)}`).then(
    (r) => r.order,
    (e) => (e instanceof ApiError && e.status === 404 ? notFound() : Promise.reject(e)),
  )
  const cur = o.currency_code.toUpperCase()
  const a = o.shipping_address
  const date = (s: string) => format.dateTime(new Date(s), { dateStyle: "medium", timeStyle: "short" })
  const method = payMethod(o.payment.provider_id)
  const awaitingTransfer = method === "bank" && o.payment.status !== "paid"
  const f = o.fulfillment
  const rr = o.return_request

  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/orders" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader
        title={t("orderTitle", { id: o.display_id })}
        sub={t("placed", { date: date(o.created_at) })}
        actions={<Badge variant={orderBadge(o.status)}>{t(`status.${o.status}`)}</Badge>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="items" className="overflow-x-auto rounded-lg border border-line bg-surface">
            <h2 id="items" className="sr-only">{t("items")}</h2>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="bg-ground text-[12px] text-ink-muted">
                  {(["product", "qty", "unitPrice", "lineTotal"] as const).map((c, i) => (
                    <th key={c} scope="col" className={`border-b border-line px-4 py-2.5 font-medium whitespace-nowrap ${i ? "text-end" : "text-start"}`}>{t(`col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id} className="border-b border-line">
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-[200px] items-center gap-3">
                        {i.thumbnail ? (
                          <Image src={i.thumbnail} alt="" width={48} height={36} className="h-9 w-12 flex-none rounded-sm object-cover" />
                        ) : (
                          <span className="h-9 w-12 flex-none rounded-sm bg-ground" />
                        )}
                        <span className="font-medium">{i.title}{i.variant_title && i.variant_title !== "Default" && <span className="text-ink-muted"> · {i.variant_title}</span>}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{i.quantity}</td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums"><bdi>{money(i.unit_price, cur)}</bdi></td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums"><bdi>{money(i.total, cur)}</bdi></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-[14px]">
                {([
                  ["subtotal", o.item_total],
                  ["shippingLine", o.shipping_total],
                  ...(o.tax_total ? [["tax", o.tax_total] as const] : []),
                ] as const).map(([k, n]) => (
                  <tr key={k}>
                    <th scope="row" colSpan={3} className="px-4 pt-2 text-end font-normal text-ink-muted">
                      {k === "shippingLine" && o.shipping_method ? t("shippingVia", { name: o.shipping_method.name }) : t(k)}
                    </th>
                    <td className="px-4 pt-2 text-end whitespace-nowrap tabular-nums"><bdi>{money(n, cur)}</bdi></td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" colSpan={3} className="px-4 pt-2 pb-3 text-end font-semibold">{t("total")}</th>
                  <td className="px-4 pt-2 pb-3 text-end text-[16px] font-semibold whitespace-nowrap tabular-nums"><bdi>{money(o.total, cur)}</bdi></td>
                </tr>
              </tfoot>
            </table>
          </section>

          {o.status === "pending" && (
            <section aria-labelledby="ship" className={panel}>
              <h2 id="ship" className={h2}>{t("shipTitle")}</h2>
              {awaitingTransfer && <p role="note" className="m-0 mb-4 rounded-md bg-warning-tint p-3 text-[13px]">{t("awaitingTransfer")}</p>}
              <FulfilForm id={o.id} disabled={awaitingTransfer} />
            </section>
          )}

          {f && (
            <section aria-labelledby="shipment" className={panel}>
              <h2 id="shipment" className={h2}>{t("shipment")}</h2>
              <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[14px]">
                <dt className="text-ink-muted">{t("carrier")}</dt><dd className="m-0"><bdi>{f.carrier}</bdi></dd>
                <dt className="text-ink-muted">{t("trackingNumber")}</dt>
                <dd className="m-0 font-mono" dir="ltr">
                  {f.tracking_url ? (
                    <a href={f.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-ink underline underline-offset-2">
                      {f.tracking_number} <ExternalLink size={14} aria-label={t("opensNewTab")} />
                    </a>
                  ) : f.tracking_number}
                </dd>
                {f.shipped_at && <><dt className="text-ink-muted">{t("shippedAt")}</dt><dd className="m-0">{date(f.shipped_at)}</dd></>}
                {f.delivered_at && <><dt className="text-ink-muted">{t("deliveredAt")}</dt><dd className="m-0">{date(f.delivered_at)}</dd></>}
              </dl>
              {o.status === "shipped" && (
                <div className="mt-4">
                  <p className="m-0 mb-3 max-w-[60ch] text-[13px] text-ink-muted">{method === "cod" ? t("deliverHelpCod") : t("deliverHelp")}</p>
                  <DeliverButton id={o.id} />
                </div>
              )}
            </section>
          )}

          {rr && (
            <section aria-labelledby="return" className={panel}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="return" className="m-0 text-[16px] leading-[22px] font-semibold">{t("returnTitle")}</h2>
                <Badge variant={rr.status === "requested" ? "warning" : rr.status === "approved" ? "success" : "danger"}>{t(`returnStatus.${rr.status}`)}</Badge>
              </div>
              <p className="m-0 mb-2 text-[14px]"><span className="text-ink-muted">{t("returnReason")}:</span> <bdi>{rr.reason}</bdi></p>
              <ul className="m-0 mb-3 list-disc ps-5 text-[14px]">
                {rr.items.map((ri) => (
                  <li key={ri.item_id}>{t("returnLine", { qty: ri.quantity, title: o.items.find((i) => i.id === ri.item_id)?.title ?? ri.item_id })}</li>
                ))}
              </ul>
              {rr.status === "requested" ? <ReturnDecision id={o.id} /> : rr.note && <p className="m-0 text-[13px] text-ink-muted">{t("yourNote")}: <bdi>{rr.note}</bdi></p>}
              {rr.status === "approved" && <p className="m-0 mt-2 text-[13px] text-ink-muted">{t("refundManual")}</p>}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="buyer" className={panel}>
            <h2 id="buyer" className={h2}>{t("buyer")}</h2>
            <address className="text-[14px] leading-[22px] not-italic">
              <bdi className="font-medium">{[a.first_name, a.last_name].filter(Boolean).join(" ")}</bdi>
              {a.company && <><br /><bdi>{a.company}</bdi></>}
              <br /><bdi>{a.address_1}</bdi>
              {a.address_2 && <><br /><bdi>{a.address_2}</bdi></>}
              <br /><bdi>{[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}</bdi>
              {a.country_code && <><br />{new Intl.DisplayNames([locale], { type: "region" }).of(a.country_code.toUpperCase())}</>}
              {a.phone && <><br /><a href={`tel:${a.phone}`} dir="ltr" className="text-brand-ink">{a.phone}</a></>}
              {o.email && <><br /><a href={`mailto:${o.email}`} dir="ltr" className="text-brand-ink">{o.email}</a></>}
            </address>
          </section>

          <section aria-labelledby="pay" className={panel}>
            <h2 id="pay" className={h2}>{t("paymentTitle")}</h2>
            <p className="m-0 flex flex-wrap items-center gap-2 text-[14px]">
              {t(`method.${method}`)}
              <Badge variant={o.payment.status === "paid" ? "success" : o.payment.status === "canceled" ? "neutral" : "warning"}>{t(`payment.${o.payment.status}`)}</Badge>
            </p>
            <p className="m-0 mt-2 text-[13px] text-ink-muted">{t(`paymentHelp.${method}`)}</p>
          </section>

          {o.status === "pending" && (
            <section aria-labelledby="cancel" className={panel}>
              <h2 id="cancel" className={h2}>{t("cancelTitle")}</h2>
              <p className="m-0 mb-3 text-[13px] text-ink-muted">{t("cancelHelp")}</p>
              <CancelForm id={o.id} />
            </section>
          )}
          {o.status === "canceled" && o.cancel_reason && (
            <section aria-labelledby="canceled" className={panel}>
              <h2 id="canceled" className={h2}>{t("canceledTitle")}</h2>
              <p className="m-0 text-[14px]"><bdi>{o.cancel_reason}</bdi></p>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
