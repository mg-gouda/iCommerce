import { Truck } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/PageHeader"
import { money } from "@icommerce/ui"
import { DeleteShippingOption, NewShippingOption } from "@/components/ShippingOptions"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import type { ShippingOption } from "@/lib/types"

export default async function ShippingPage() {
  const t = await getTranslations("shipping")
  const { shipping_options } = await vendorApi<{ shipping_options: ShippingOption[] }>("/vendors/shipping-options")
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/settings" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader title={t("title")} sub={t("sub")} />

      {shipping_options.length === 0 ? (
        <section className="mb-6 flex max-w-[880px] flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6">
          <Truck size={24} className="text-ink-muted" aria-hidden />
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("emptyTitle")}</h2>
          <p className="m-0 max-w-[60ch] text-ink-muted">{t("emptyBody")}</p>
        </section>
      ) : (
        <div className="mb-6 max-w-[880px] overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="bg-ground text-[12px] text-ink-muted">
                {(["name", "kind", "price", "actions"] as const).map((c) => (
                  <th key={c} scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium whitespace-nowrap last:text-end">
                    {c === "actions" ? <span className="sr-only">{t(`col.${c}`)}</span> : t(`col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shipping_options.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5 font-medium"><bdi>{o.name}</bdi></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{t(`kinds.${o.kind}`)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums"><bdi>{o.kind === "pickup" ? t("free") : o.kind === "free_over" ? t("priceFreeOver", { amount: money(o.amount, "USD"), over: money(o.free_over ?? 0, "USD") }) : money(o.amount, "USD")}</bdi></td>
                  <td className="px-4 py-2.5 text-end"><DeleteShippingOption option={o} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="m-0 mb-3 text-[20px] leading-[26px] font-semibold">{t("addTitle")}</h2>
      <NewShippingOption />
    </>
  )
}
