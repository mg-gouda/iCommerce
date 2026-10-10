import { useLocale, useTranslations } from "next-intl"
import { Badge, ShipButton, money } from "@icommerce/ui"
import { orders } from "@/lib/mock-orders"

export function OrdersTable() {
  const t = useTranslations("sections.orders")
  const locale = useLocale() as "en" | "ar"
  return (
    <>
      <h1 className="m-0 text-[30px] leading-[36px] font-semibold tracking-[-0.01em]">{t("title")}</h1>
      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="bg-ground text-start text-[12px] text-ink-muted">
              {(["order", "buyer", "channel", "items", "total", "action"] as const).map((c) => (
                <th key={c} scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium whitespace-nowrap last:text-end">
                  {t(`col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2.5 font-mono whitespace-nowrap">{o.id}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{o.buyer[locale]}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={o.channel === "b2b" ? "b2b" : undefined}>{t(`channel.${o.channel}`)}</Badge>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{o.items[locale]}</td>
                <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums"><bdi>{money(o.total, "USD")}</bdi></td>
                <td className="px-4 py-2.5 text-end">
                  <ShipButton size="sm" shipped={o.shipped} label={t("ship")} busyLabel={t("shipping")} doneLabel={t("shipped")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
