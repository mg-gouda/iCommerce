import { ArrowRight, FileText } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { bidi } from "@icommerce/ui"
import { PageHeader, panel } from "@/components/PageHeader"
import { BreakdownTable, KpiTiles, RevenueChart, usd } from "@/components/Reports"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import type { Breakdown, ReportSummary } from "@/lib/types"

// Last 30 days (backend default range).
export default async function Dashboard() {
  const [t, ts] = await Promise.all([getTranslations("dashboard"), getTranslations("stats")])
  const tn = await getTranslations("nav")
  const [summary, top] = await Promise.all([
    vendorApi<ReportSummary>("/vendors/reports/summary"),
    vendorApi<Breakdown>("/vendors/reports/breakdown?by=product&limit=5"),
  ])
  const { kpis, range } = summary
  return (
    <>
      <PageHeader
        title={tn("dashboard")}
        sub={t("sub")}
        actions={<Link href="/dashboard/reports" className="ic-btn no-underline">{t("allReports")} <ArrowRight size={16} aria-hidden className="rtl:-scale-x-100" /></Link>}
      />
      <div className="flex flex-col gap-6">
        <KpiTiles summary={summary} label={t("kpis")} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <RevenueChart series={summary.series} from={range.from} to={range.to} />
          <div className="flex flex-col gap-6">
            <section className={`${panel} flex flex-col gap-1`} aria-labelledby="net">
              <h2 id="net" className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{ts("net")}</h2>
              <p className={`m-0 text-[22px] leading-[30px] font-semibold tabular-nums ${kpis.net < 0 ? "text-danger" : ""}`}><bdi>{kpis.net < 0 ? `−${usd(-kpis.net)}` : usd(kpis.net)}</bdi></p>
              <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
                {t("netNote", { revenue: bidi(usd(kpis.revenue)), commission: bidi(usd(kpis.commission)), fee: bidi(usd(kpis.fee_share)) })}
              </p>
            </section>
            <section className={`${panel} flex flex-col items-start gap-2`} aria-labelledby="quotes">
              <h2 id="quotes" className="m-0 flex items-center gap-2 text-[16px] leading-[22px] font-semibold"><FileText size={18} aria-hidden className="text-ink-muted" />{t("quotes")}</h2>
              <p className="m-0 text-ink-muted">{t("quotesBody", { count: kpis.open_quotes })}</p>
              <Link href="/dashboard/quotes" className="ic-btn ic-btn--sm no-underline">{t("viewQuotes")}</Link>
            </section>
          </div>
        </div>
        <section aria-labelledby="top" className="flex flex-col gap-3">
          <h2 id="top" className="m-0 text-[20px] leading-[28px] font-semibold">{t("topProducts")}</h2>
          {top.rows.length ? (
            <BreakdownTable rows={top.rows} by="product" caption={t("topProducts")} />
          ) : (
            <p className={`${panel} m-0 text-ink-muted`}>{t("noProducts")}</p>
          )}
        </section>
      </div>
    </>
  )
}
