import { getLocale, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { Link, redirect } from "@/i18n/navigation"
import { getCredit, getMembership } from "@/lib/p3/api"

const INVOICE_BADGE = { open: "neutral", paid: "success", overdue: "danger" } as const

export default async function CreditPage() {
  const [t, locale, m] = await Promise.all([getTranslations("b2b"), getLocale(), getMembership()])
  if (!m) redirect({ href: "/account/company", locale })
  const { credit_account: acc, used, available, invoices } = await getCredit()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })

  if (!acc)
    return (
      <section className="flex max-w-[65ch] flex-col gap-2">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("credit")}</h2>
        <p className="m-0 text-ink-muted">{m!.company.kyc_status === "verified" ? t("noCredit") : t("noCreditUnverified")}</p>
      </section>
    )

  const overdue = invoices.some((i) => i.status === "overdue")
  const pct = acc.limit_usd ? Math.min(100, Math.round((used / acc.limit_usd) * 100)) : 0
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="credit" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="credit" className="m-0 text-[20px] leading-[26px] font-semibold">{t("creditTitle", { n: acc.terms_days })}</h2>
          <Badge variant={acc.status === "active" ? "success" : "warning"}>{t(`creditStatus.${acc.status}`)}</Badge>
        </div>
        {(overdue || acc.status === "on_hold") && (
          <p role="alert" className="m-0 max-w-[70ch] rounded-md bg-danger-tint p-3 text-[14px] text-ink">{overdue ? t("overdueBlock") : t("onHold")}</p>
        )}
        <div className="flex max-w-[720px] flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-6">
          <dl className="m-0 grid grid-cols-3 gap-4 tabular-nums">
            {[[t("limit"), acc.limit_usd], [t("used"), used], [t("available"), available]].map(([k, v]) => (
              <div key={k as string} className="flex flex-col">
                <dt className="text-[13px] text-ink-muted">{k}</dt>
                <dd className="m-0 text-[16px] font-semibold md:text-[20px]"><bdi>{money(v as number, "USD")}</bdi></dd>
              </div>
            ))}
          </dl>
          <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("usedPct", { n: pct })} className="h-2 overflow-hidden rounded-full bg-ground">
            <div className={`h-full ${pct >= 90 ? "bg-danger" : "bg-brand"}`} style={{ inlineSize: `${pct}%` }} />
          </div>
          <p className="m-0 text-[13px] text-ink-muted">{t("creditHow", { n: acc.terms_days })}</p>
        </div>
      </section>

      <section aria-labelledby="invoices" className="flex flex-col gap-3">
        <h2 id="invoices" className="m-0 text-[20px] leading-[26px] font-semibold">{t("invoices")}</h2>
        {invoices.length ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-[14px] tabular-nums">
              <thead>
                <tr className="border-b border-line bg-ground text-[12px] text-ink-muted">
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("order")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium max-sm:hidden">{t("issued")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("due")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("statusCol")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-3"><Link href={`/account/orders/${i.order_id}`} className="text-brand-ink underline underline-offset-2">#{i.display_id}</Link></td>
                    <td className="px-3 py-3 max-sm:hidden">{date.format(new Date(i.created_at))}</td>
                    <td className="px-3 py-3">{date.format(new Date(i.due_date))}</td>
                    <td className="px-3 py-3"><Badge variant={INVOICE_BADGE[i.status]}>{t(`invoice.${i.status}`)}</Badge></td>
                    <td className="px-3 py-3 text-end font-semibold"><bdi>{money(i.amount, i.currency_code.toUpperCase())}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-ink-muted">{t("noInvoices")}</p>
        )}
      </section>
    </div>
  )
}
