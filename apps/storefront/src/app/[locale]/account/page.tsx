import { getLocale, getTranslations } from "next-intl/server"
import { sdk } from "@icommerce/sdk"
import { money } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { auth } from "@/lib/session"

export default async function OrdersPage() {
  const [t, locale] = await Promise.all([getTranslations("account"), getLocale()])
  const { orders: all } = await sdk.store.order.list(
    { fields: "id,display_id,created_at,total,currency_code,metadata,items.id,items.quantity", order: "-created_at", limit: 50 },
    await auth()
  )
  // Vendor sub-orders share the customer; the buyer only sees parents (sub-order progress shows inside each parent).
  const orders = all.filter((o) => !o.metadata?.parent_order_id)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })

  if (!orders.length)
    return (
      <div className="flex flex-col items-start gap-3">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("noOrders")}</h2>
        <p className="m-0 text-ink-muted">{t("noOrdersBody")}</p>
        <Link href="/search" className="ic-btn ic-btn--primary no-underline">{t("browse")}</Link>
      </div>
    )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("orders")}</h2>
      {/* ponytail: newest 50 orders incl. sub-orders before filtering; pagination when someone has more. */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 text-ink no-underline hover:border-line-strong">
              <span className="flex flex-col">
                <span className="font-semibold">{t("orderN", { n: o.display_id ?? "" })}</span>
                <span className="text-[13px] text-ink-muted">
                  {date.format(new Date(o.created_at))} · {t("itemsN", { n: o.items?.reduce((s, i) => s + i.quantity, 0) ?? 0 })}
                </span>
              </span>
              <bdi className="font-semibold tabular-nums">{money(o.total, o.currency_code.toUpperCase())}</bdi>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
