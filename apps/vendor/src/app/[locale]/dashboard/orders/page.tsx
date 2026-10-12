import { Search, ShoppingCart } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { PageHeader } from "@/components/PageHeader"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import { orderBadge, payMethod } from "@/lib/status"
import type { OrderStatus, VendorOrder } from "@/lib/types"

const LIMIT = 20
const STATUSES: OrderStatus[] = ["pending", "shipped", "delivered", "canceled"]

type SP = { q?: string; status?: string; page?: string }

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const t = await getTranslations("orders")
  const format = await getFormatter()
  const status = STATUSES.includes(sp.status as OrderStatus) ? sp.status : ""
  const page = Math.max(1, Number(sp.page) || 1)
  const qs = new URLSearchParams({ limit: String(LIMIT), offset: String((page - 1) * LIMIT) })
  if (sp.q) qs.set("q", sp.q)
  if (status) qs.set("status", status)
  const { orders, count } = await vendorApi<{ orders: VendorOrder[]; count: number }>(`/vendors/orders?${qs}`)
  const pages = Math.max(1, Math.ceil(count / LIMIT))
  const pageHref = (p: number) => ({ pathname: "/dashboard/orders", query: { ...(sp.q && { q: sp.q }), ...(status && { status }), page: p } })
  const filtered = !!(sp.q || status)

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      <form role="search" className="mb-4 flex flex-wrap items-end gap-3" action="">
        <div className="ic-field min-w-[220px] flex-[1_1_280px]">
          <label htmlFor="q" className="ic-label">{t("search")}</label>
          <input id="q" name="q" type="search" defaultValue={sp.q} className="ic-input" placeholder={t("searchPlaceholder")} />
        </div>
        <div className="ic-field">
          <label htmlFor="status" className="ic-label">{t("statusFilter")}</label>
          <select id="status" name="status" defaultValue={status} className="ic-input w-auto">
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="ic-btn">
          <Search size={16} aria-hidden /> {t("apply")}
        </button>
      </form>

      {orders.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6 md:p-8">
          <ShoppingCart size={24} className="text-ink-muted" aria-hidden />
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{filtered ? t("noMatchTitle") : t("emptyTitle")}</h2>
          <p className="m-0 max-w-[60ch] text-ink-muted">{filtered ? t("noMatchBody") : t("emptyBody")}</p>
        </section>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-[14px]">
              <caption className="sr-only">{t("caption", { count })}</caption>
              <thead>
                <tr className="bg-ground text-[12px] text-ink-muted">
                  {(["order", "date", "buyer", "items", "total", "payment", "status"] as const).map((c) => (
                    <th key={c} scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium whitespace-nowrap">{t(`col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const units = o.items.reduce((s, i) => s + i.quantity, 0)
                  return (
                    <tr key={o.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link href={`/dashboard/orders/${o.id}`} className="font-mono font-medium text-ink">#{o.display_id}</Link>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{format.dateTime(new Date(o.created_at), { dateStyle: "medium" })}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <bdi>{[o.buyer.first_name, o.buyer.last_name].filter(Boolean).join(" ") || o.email}</bdi>
                        {o.shipping_address.city && <span className="text-[12px] text-ink-muted"> · <bdi>{o.shipping_address.city}</bdi></span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{t("units", { count: units })}</td>
                      <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums"><bdi>{money(o.total, o.currency_code.toUpperCase())}</bdi></td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {t(`method.${payMethod(o.payment.provider_id)}`)}
                        <span className="text-[12px] text-ink-muted"> · {t(`payment.${o.payment.status}`)}</span>
                      </td>
                      <td className="px-4 py-2.5"><Badge variant={orderBadge(o.status)}>{t(`status.${o.status}`)}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
            <span>{t("pageOf", { page, pages, count })}</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={pageHref(page - 1)} className="ic-btn ic-btn--sm no-underline" rel="prev">{t("prev")}</Link>}
              {page < pages && <Link href={pageHref(page + 1)} className="ic-btn ic-btn--sm no-underline" rel="next">{t("next")}</Link>}
            </span>
          </nav>
        </>
      )}
    </>
  )
}
