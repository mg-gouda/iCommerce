import { ChartColumn, Download } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { PageHeader, panel } from "@/components/PageHeader"
import { BreakdownTable, KpiTiles, RevenueChart } from "@/components/Reports"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import type { Breakdown, ReportSummary } from "@/lib/types"

const TABS = ["period", "product", "category", "country", "channel", "buyer"] as const
const PRESETS = { "7d": 6, "30d": 29, "90d": 89, "12m": 364 } as const
const LIMIT = 50
type Tab = (typeof TABS)[number]
type Preset = keyof typeof PRESETS | "custom"
type SP = { tab?: string; range?: string; from?: string; to?: string; channel?: string; paid?: string; page?: string }

const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
/** UTC today (server render per request). */
const today = () => iso(Date.now())
const isDay =(s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const [t, tn, format] = await Promise.all([getTranslations("reports"), getTranslations("stats"), getFormatter()])
  const nav = await getTranslations("nav")
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "period"
  const custom = sp.range === "custom" && isDay(sp.from) && isDay(sp.to) && sp.from <= sp.to
  const preset: Preset = custom ? "custom" : sp.range && sp.range in PRESETS ? (sp.range as Preset) : "30d"
  const to = custom ? sp.to! : today()
  const from = custom ? sp.from! : iso(Date.parse(to) - PRESETS[preset as keyof typeof PRESETS] * DAY)
  const channel = sp.channel === "b2b" || sp.channel === "b2c" ? sp.channel : ""
  const paid = sp.paid === "true"
  const page = Math.max(1, Number(sp.page) || 1)

  const filters = { from, to, ...(channel && { channel }), ...(paid && { paid: "true" }) }
  const keep = { range: preset, ...(custom && { from, to }), ...(channel && { channel }), ...(paid && { paid: "true" }) }
  const href = (q: Record<string, string | number>) => ({ pathname: "/dashboard/reports", query: q })
  const csv = `/api/reports/csv?${new URLSearchParams({ by: tab, ...filters })}`
  const day = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })

  const qs = new URLSearchParams(filters)
  const summary = tab === "period" ? await vendorApi<ReportSummary>(`/vendors/reports/summary?${qs}`) : null
  const breakdown =
    tab === "period" ? null : await vendorApi<Breakdown>(`/vendors/reports/breakdown?${qs}&by=${tab}&limit=${LIMIT}&offset=${(page - 1) * LIMIT}`)
  const pages = breakdown ? Math.max(1, Math.ceil(breakdown.count / LIMIT)) : 1

  return (
    <>
      <PageHeader
        title={nav("reports")}
        sub={t("sub")}
        actions={<a href={csv} download className="ic-btn no-underline"><Download size={16} aria-hidden /> {tn("csv")}</a>}
      />

      <nav aria-label={t("tabs")} className="mb-4 overflow-x-auto border-b border-line">
        <ul className="m-0 flex list-none gap-1 p-0">
          {TABS.map((x) => (
            <li key={x}>
              <Link
                href={href({ ...keep, tab: x })}
                aria-current={x === tab ? "page" : undefined}
                className="-mb-px block border-b-2 border-transparent px-3 py-2 text-[14px] font-medium whitespace-nowrap text-ink-muted no-underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-[current=page]:border-brand aria-[current=page]:text-ink"
              >
                {t(`tab.${x}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mb-6 flex flex-col gap-3">
        <div role="group" aria-label={t("range")} className="flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as Preset[]).map((p) => (
            <Link key={p} href={href({ tab, range: p, ...(channel && { channel }), ...(paid && { paid: "true" }) })} aria-current={p === preset ? "true" : undefined}
              className="ic-btn ic-btn--sm no-underline aria-[current=true]:border-brand aria-[current=true]:bg-brand-tint">
              {t(`preset.${p}`)}
            </Link>
          ))}
        </div>
        <form action="" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="range" value="custom" />
          <div className="ic-field">
            <label htmlFor="from" className="ic-label">{t("from")}</label>
            <input id="from" name="from" type="date" defaultValue={from} max={to} required className="ic-input w-auto" />
          </div>
          <div className="ic-field">
            <label htmlFor="to" className="ic-label">{t("to")}</label>
            <input id="to" name="to" type="date" defaultValue={to} required className="ic-input w-auto" />
          </div>
          <div className="ic-field">
            <label htmlFor="channel" className="ic-label">{t("channel")}</label>
            <select id="channel" name="channel" defaultValue={channel} className="ic-input w-auto">
              <option value="">{t("allChannels")}</option>
              <option value="b2c">{tn("b2c")}</option>
              <option value="b2b">{tn("b2b")}</option>
            </select>
          </div>
          <label className="flex h-[38px] items-center gap-2 text-[14px]">
            <input type="checkbox" name="paid" value="true" defaultChecked={paid} className="size-4 accent-brand" />
            {t("paidOnly")}
          </label>
          <button type="submit" className="ic-btn">{t("apply")}</button>
        </form>
      </div>

      {summary && (
        <div className="flex flex-col gap-6">
          <KpiTiles summary={summary} label={t(`tab.period`)} />
          <RevenueChart series={summary.series} from={from} to={to} />
        </div>
      )}

      {breakdown &&
        (breakdown.rows.length === 0 ? (
          <section className={`${panel} flex flex-col items-start gap-2`}>
            <ChartColumn size={24} className="text-ink-muted" aria-hidden />
            <p className="m-0 max-w-[60ch] text-ink-muted">{t("empty")}</p>
          </section>
        ) : (
          <>
            <BreakdownTable rows={breakdown.rows} by={tab} caption={t("caption", { count: breakdown.count, from: day(from), to: day(to) })} />
            <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
              <span>{t("pageOf", { page, pages })}</span>
              <span className="flex gap-2">
                {page > 1 && <Link href={href({ ...keep, tab, page: page - 1 })} className="ic-btn ic-btn--sm no-underline" rel="prev">{t("prev")}</Link>}
                {page < pages && <Link href={href({ ...keep, tab, page: page + 1 })} className="ic-btn ic-btn--sm no-underline" rel="next">{t("next")}</Link>}
              </span>
            </nav>
          </>
        ))}
    </>
  )
}
