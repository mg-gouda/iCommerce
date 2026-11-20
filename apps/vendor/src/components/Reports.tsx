import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { bidi, money } from "@icommerce/ui"
import type { BreakdownRow, ReportSummary, SeriesPoint } from "@/lib/types"

// Plain SVG + tables, no chart dependency. Money and counts keep Latin digits (same as money()).
export const usd = (n: number) => money(n, "USD")
export const count = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 })
const DAY = 86_400_000
export const rangeDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1
/** Same default as the backend: day up to 62 days, else month (the portal never asks for weeks). */
const intervalOf = (from: string, to: string) => (rangeDays(from, to) <= 62 ? "day" : "month")

const th = "border-b border-line px-4 py-2.5 font-medium whitespace-nowrap"
const td = "px-4 py-2.5"

/** KPI tiles with the change vs the same-length previous range (icon + sign + text, never color alone). */
export async function KpiTiles({ summary, label }: { summary: ReportSummary; label: string }) {
  const t = await getTranslations("stats")
  const days = rangeDays(summary.range.from, summary.range.to)
  const tiles = [
    ["revenue", usd(summary.kpis.revenue), summary.kpis.revenue, summary.previous.revenue],
    ["orders", count(summary.kpis.orders), summary.kpis.orders, summary.previous.orders],
    ["aov", usd(summary.kpis.aov), summary.kpis.aov, summary.previous.aov],
    ["units", count(summary.kpis.units), summary.kpis.units, summary.previous.units],
  ] as const
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([k, shown, cur, prev]) => {
        const pct = prev ? Math.round(((cur - prev) / prev) * 100) : null
        const Icon = pct == null || pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown
        const tone = pct == null || pct === 0 ? "text-ink-muted" : pct > 0 ? "text-success" : "text-danger"
        const text = pct == null ? (cur ? t("noPrev", { days }) : t("flat", { days })) : pct === 0 ? t("flat", { days }) : t("vsPrev", { delta: bidi(`${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`), days })
        return (
          <div key={k} className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4">
            <h3 className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{t(k)}</h3>
            <p className="m-0 text-[18px] leading-[26px] font-semibold tabular-nums break-words sm:text-[22px] sm:leading-[30px]"><bdi>{shown}</bdi></p>
            <p className={`m-0 flex items-start gap-1 text-[12px] leading-4 ${tone}`}>
              <Icon size={14} aria-hidden className="mt-px flex-none" />
              {pct != null && pct !== 0 && <span className="sr-only">{t(pct > 0 ? "up" : "down")}</span>}
              <span>{text}</span>
            </p>
          </div>
        )
      })}
    </section>
  )
}

/** Revenue bars over time. SVG is decorative to AT; the summary goes in aria-label and the table below is the fallback. */
export async function RevenueChart({ series, from, to }: { series: SeriesPoint[]; from: string; to: string }) {
  const t = await getTranslations("stats")
  const format = await getFormatter()
  const interval = intervalOf(from, to)
  const label = (p: string) =>
    format.dateTime(new Date(`${p}T00:00:00Z`), interval === "month" ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" })
  const max = Math.max(0, ...series.map((s) => s.revenue))
  const top = series.find((s) => s.revenue === max)
  const total = series.reduce((s, p) => s + p.revenue, 0)
  const W = 600
  const H = 160
  const step = W / Math.max(series.length, 1)
  const bw = Math.max(step * 0.66, 1)
  return (
    <figure className="m-0 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-6">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("chartTitle", { interval })}</h2>
        <span className="text-[13px] text-ink-muted">{t("peak", { value: bidi(usd(max)) })}</span>
      </figcaption>
      {max === 0 ? (
        <p className="m-0 py-8 text-center text-ink-muted">{t("chartEmpty")}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t("chartLabel", { from: label(from), to: label(to), total: bidi(usd(total)), max: bidi(usd(max)), maxPeriod: label(top!.period) })}
            className="block h-40 w-full rtl:-scale-x-100"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--color-line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {series.map((s, i) => {
              const h = (s.revenue / max) * (H - 4)
              return s.revenue > 0 ? <rect key={s.period} x={i * step + (step - bw) / 2} y={H - h} width={bw} height={h} rx={Math.min(2, bw / 2)} fill="var(--color-brand)" /> : null
            })}
          </svg>
          <div className="flex justify-between text-[12px] text-ink-muted" aria-hidden>
            <span>{label(series[0].period)}</span>
            {series.length > 2 && <span>{label(series[Math.floor(series.length / 2)].period)}</span>}
            <span>{label(series.at(-1)!.period)}</span>
          </div>
        </>
      )}
      <details className="text-[14px]">
        <summary className="cursor-pointer text-[13px] font-medium text-brand-ink">{t("showTable")}</summary>
        <div className="mt-3 max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full border-collapse">
            <caption className="sr-only">{t("chartTitle", { interval })}</caption>
            <thead>
              <tr className="bg-ground text-[12px] text-ink-muted">
                <th scope="col" className={`${th} text-start`}>{t("period")}</th>
                <th scope="col" className={`${th} text-end`}>{t("revenue")}</th>
                <th scope="col" className={`${th} text-end`}>{t("orders")}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.period} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-start font-normal whitespace-nowrap`}>{label(s.period)}</th>
                  <td className={`${td} text-end tabular-nums`}><bdi>{usd(s.revenue)}</bdi></td>
                  <td className={`${td} text-end tabular-nums`}>{count(s.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** Breakdown rows; the share bar repeats the % shown as text. */
export async function BreakdownTable({ rows, caption, by }: { rows: BreakdownRow[]; caption: string; by: string }) {
  const t = await getTranslations("stats")
  const name = (r: BreakdownRow) => (r.key == null ? t("unassigned") : by === "channel" ? t(r.key === "b2b" ? "b2b" : "b2c") : r.label)
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-ground text-[12px] text-ink-muted">
            <th scope="col" className={`${th} text-start`}>{t("label")}</th>
            <th scope="col" className={`${th} text-end`}>{t("revenue")}</th>
            <th scope="col" className={`${th} text-end`}>{t("orders")}</th>
            <th scope="col" className={`${th} text-end`}>{t("units")}</th>
            <th scope="col" className={`${th} text-start`}>{t("share")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? "-"} className="border-b border-line last:border-b-0">
              <th scope="row" className={`${td} min-w-44 max-w-[28ch] text-start font-medium ${r.key == null ? "text-ink-muted" : ""}`}><bdi>{name(r)}</bdi></th>
              <td className={`${td} text-end font-semibold whitespace-nowrap tabular-nums`}><bdi>{usd(r.revenue)}</bdi></td>
              <td className={`${td} text-end tabular-nums`}>{count(r.orders)}</td>
              <td className={`${td} text-end tabular-nums`}>{count(r.units)}</td>
              <td className={`${td} min-w-32`}>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ground" aria-hidden>
                    <span className="block h-full rounded-full bg-brand" style={{ inlineSize: `${Math.round(r.share * 100)}%` }} />
                  </span>
                  <span className="w-12 text-end text-[13px] tabular-nums"><bdi>{Math.round(r.share * 1000) / 10}%</bdi></span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
