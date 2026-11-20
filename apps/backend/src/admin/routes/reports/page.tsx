import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { selectCls, usd, useGet } from "../../lib"

type Point = { period: string; revenue: number; orders: number }
type Kpis = { gmv: number; orders: number; aov: number; units: number; commission: number; fees: number; active_vendors: number; new_vendors: number; new_companies: number }
type Summary = { range: { from: string; to: string }; kpis: Kpis; previous: { gmv: number; orders: number; aov: number; units: number }; series: Point[] }
type Row = { key: string | null; label: string; revenue: number; orders: number; units: number; share: number; commission: number; fees: number }
const BY = ["vendor", "branch", "branch_manager", "account_manager", "broker", "channel", "category", "country", "buyer"]
const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 3 })

function Chart({ series }: { series: Point[] }) {
  const max = Math.max(0, ...series.map((s) => s.revenue))
  const W = 600
  const H = 140
  const step = W / Math.max(series.length, 1)
  if (!max) return <Text size="small" className="text-ui-fg-subtle">No GMV in this range.</Text>
  return (
    <div className="flex flex-col gap-1">
      <Text size="xsmall" className="text-ui-fg-subtle">Max {usd(max)}</Text>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`GMV by period, max ${usd(max)}`} className="block h-36 w-full">
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--border-base, #e4e4e7)" vectorEffect="non-scaling-stroke" />
        {series.map((s, i) => {
          const h = (s.revenue / max) * (H - 4)
          return s.revenue > 0 ? <rect key={s.period} x={i * step + step * 0.17} y={H - h} width={Math.max(step * 0.66, 1)} height={h} fill="currentColor" className="text-ui-fg-interactive"><title>{`${s.period}: ${usd(s.revenue)}`}</title></rect> : null
        })}
      </svg>
      <div className="flex justify-between"><Text size="xsmall" className="text-ui-fg-subtle">{series[0]?.period}</Text><Text size="xsmall" className="text-ui-fg-subtle">{series.at(-1)?.period}</Text></div>
      <details>
        <summary className="cursor-pointer txt-compact-small">Show as table</summary>
        <Table>
          <Table.Header><Table.Row>{["Period", "GMV", "Orders"].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row></Table.Header>
          <Table.Body>{series.map((s) => <Table.Row key={s.period}><Table.Cell>{s.period}</Table.Cell><Table.Cell>{usd(s.revenue)}</Table.Cell><Table.Cell>{s.orders}</Table.Cell></Table.Row>)}</Table.Body>
        </Table>
      </details>
    </div>
  )
}

const ReportsPage = () => {
  const [from, setFrom] = useState(iso(Date.now() - 29 * DAY))
  const [to, setTo] = useState(iso(Date.now()))
  const [channel, setChannel] = useState("")
  const [by, setBy] = useState("vendor")
  const qs = `from=${from}&to=${to}${channel ? `&channel=${channel}` : ""}`
  const { data: s, error } = useGet<Summary>(`/admin/reports/summary?${qs}`)
  const { data: b } = useGet<{ rows: Row[]; count: number; total: Omit<Row, "key" | "label" | "share"> }>(`/admin/reports/breakdown?${qs}&by=${by}&limit=100`)
  const delta = (cur: number, prev: number) => (prev ? `${cur >= prev ? "+" : "−"}${Math.abs(Math.round(((cur - prev) / prev) * 100))}% vs previous` : "no previous data")
  const tiles: [string, string, string?][] = s
    ? [
        ["GMV", usd(s.kpis.gmv), delta(s.kpis.gmv, s.previous.gmv)],
        ["Orders", n(s.kpis.orders), delta(s.kpis.orders, s.previous.orders)],
        ["Average order", usd(s.kpis.aov), delta(s.kpis.aov, s.previous.aov)],
        ["Units", n(s.kpis.units), delta(s.kpis.units, s.previous.units)],
        ["Commission", usd(s.kpis.commission)],
        ["Platform fees", usd(s.kpis.fees)],
        ["Active vendors", n(s.kpis.active_vendors)],
        ["New vendors / companies", `${s.kpis.new_vendors} / ${s.kpis.new_companies}`],
      ]
    : []
  return (
    <Container className="p-0 divide-y">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 py-4">
        <div>
          <Heading>Reports</Heading>
          <Text size="small" className="text-ui-fg-subtle">Non-canceled vendor orders by day of purchase (UTC). Fees = Σ vendor fee shares.</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input size="small" type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <Input size="small" type="date" aria-label="To" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          <select aria-label="Channel" className={selectCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All channels</option><option value="b2c">B2C</option><option value="b2b">B2B</option>
          </select>
        </div>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <div className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-ui-border-base p-3">
            <Text size="xsmall" className="text-ui-fg-subtle">{label}</Text>
            <Text size="large" weight="plus">{value}</Text>
            {sub && <Text size="xsmall" className="text-ui-fg-subtle">{sub}</Text>}
          </div>
        ))}
      </div>
      <div className="px-6 py-4">{s && <Chart series={s.series} />}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <Heading level="h2">Breakdown</Heading>
        <div className="flex items-center gap-2">
          <select aria-label="Break down by" className={selectCls} value={by} onChange={(e) => setBy(e.target.value)}>
            {BY.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
          </select>
          <a className="txt-compact-small text-ui-fg-interactive underline" href={`/admin/reports/breakdown?${qs}&by=${by}&format=csv`} download>Download CSV</a>
        </div>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>{["Name", "GMV", "Orders", "Units", "Share", "Commission", "Fees"].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row>
        </Table.Header>
        <Table.Body>
          {b?.rows.map((r) => (
            <Table.Row key={r.key ?? "-"}>
              <Table.Cell className={r.key ? undefined : "text-ui-fg-subtle"}>{r.label}</Table.Cell>
              <Table.Cell>{usd(r.revenue)}</Table.Cell>
              <Table.Cell>{r.orders}</Table.Cell>
              <Table.Cell>{n(r.units)}</Table.Cell>
              <Table.Cell>{(r.share * 100).toFixed(1)}%</Table.Cell>
              <Table.Cell>{usd(r.commission)}</Table.Cell>
              <Table.Cell>{usd(r.fees)}</Table.Cell>
            </Table.Row>
          ))}
          {b && b.rows.length > 0 && (
            <Table.Row>
              <Table.Cell><b>Total</b></Table.Cell>
              <Table.Cell><b>{usd(b.total.revenue)}</b></Table.Cell>
              <Table.Cell>{b.total.orders}</Table.Cell>
              <Table.Cell>{n(b.total.units)}</Table.Cell>
              <Table.Cell />
              <Table.Cell>{usd(b.total.commission)}</Table.Cell>
              <Table.Cell>{usd(b.total.fees)}</Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table>
      {b && !b.rows.length && <Text className="px-6 py-4 text-ui-fg-subtle">No sales in this range.</Text>}
      {b && b.count > 100 && <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Top 100 of {b.count}; download the CSV for every row.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Reports" })
export default ReportsPage
