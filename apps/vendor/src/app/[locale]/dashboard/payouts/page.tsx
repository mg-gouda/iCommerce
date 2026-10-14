import { Search, Wallet } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { Badge, type BadgeProps, money } from "@icommerce/ui"
import { PageHeader, panel } from "@/components/PageHeader"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import type { LedgerEntry, LedgerStatus, LedgerType, PayoutBatch, PayoutSummary } from "@/lib/types"

const LIMIT = 20
const TYPES: LedgerType[] = ["sale", "commission", "fee_collected", "refund", "payout", "adjustment"]
const STATUSES: LedgerStatus[] = ["pending", "available", "paid"]
const tone: Record<LedgerStatus, NonNullable<BadgeProps["variant"]>> = { pending: "warning", available: "neutral", paid: "success" }
const usd = (n: number) => money(n, "USD")
/** Signed amount: explicit sign so meaning never rides on color alone. */
const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${usd(Math.abs(n))}`

type SP = { type?: string; status?: string; page?: string }

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const t = await getTranslations("payouts")
  const format = await getFormatter()
  const type = TYPES.includes(sp.type as LedgerType) ? sp.type : ""
  const status = STATUSES.includes(sp.status as LedgerStatus) ? sp.status : ""
  const page = Math.max(1, Number(sp.page) || 1)
  const qs = new URLSearchParams({ limit: String(LIMIT), offset: String((page - 1) * LIMIT), ...(type && { type }), ...(status && { status }) })
  const [{ summary, batches }, { entries, count }] = await Promise.all([
    vendorApi<{ summary: PayoutSummary; batches: PayoutBatch[] }>("/vendors/payouts"),
    vendorApi<{ entries: LedgerEntry[]; count: number }>(`/vendors/payouts/ledger?${qs}`),
  ])
  const pages = Math.max(1, Math.ceil(count / LIMIT))
  const pageHref = (p: number) => ({ pathname: "/dashboard/payouts", query: { ...(type && { type }), ...(status && { status }), page: p } })
  const date = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "medium" }) : "—")
  const cards: ["available" | "pending" | "owed" | "paid", number, string][] = [
    ["available", summary.available, t("cards.availableHint")],
    ["pending", summary.pending, t("cards.pendingHint")],
    summary.owed > 0 ? ["owed", summary.owed, t("cards.owedHint")] : ["paid", summary.paid_total, t("cards.paidHint")],
  ]

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      <section aria-label={t("summary")} className="mb-6 grid gap-3 sm:grid-cols-3">
        {cards.map(([k, v, hint]) => (
          <div key={k} className={`${panel} flex flex-col gap-1 ${k === "owed" ? "border-danger" : ""}`}>
            <h2 className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{t(`cards.${k}`)}</h2>
            <p className={`m-0 text-[24px] leading-[32px] font-semibold tabular-nums ${k === "owed" ? "text-danger" : ""}`}><bdi>{usd(v)}</bdi></p>
            <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{hint}</p>
          </div>
        ))}
      </section>

      <h2 className="m-0 mb-3 text-[20px] leading-[28px] font-semibold">{t("ledger")}</h2>
      <form role="search" className="mb-4 flex flex-wrap items-end gap-3" action="">
        <div className="ic-field">
          <label htmlFor="type" className="ic-label">{t("typeFilter")}</label>
          <select id="type" name="type" defaultValue={type} className="ic-input w-auto">
            <option value="">{t("allTypes")}</option>
            {TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}
          </select>
        </div>
        <div className="ic-field">
          <label htmlFor="status" className="ic-label">{t("statusFilter")}</label>
          <select id="status" name="status" defaultValue={status} className="ic-input w-auto">
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((x) => <option key={x} value={x}>{t(`status.${x}`)}</option>)}
          </select>
        </div>
        <button type="submit" className="ic-btn"><Search size={16} aria-hidden /> {t("apply")}</button>
      </form>

      {entries.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6 md:p-8">
          <Wallet size={24} className="text-ink-muted" aria-hidden />
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{type || status ? t("noMatchTitle") : t("emptyTitle")}</h2>
          <p className="m-0 max-w-[60ch] text-ink-muted">{type || status ? t("noMatchBody") : t("emptyBody")}</p>
        </section>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-[14px]">
              <caption className="sr-only">{t("caption", { count })}</caption>
              <thead>
                <tr className="bg-ground text-[12px] text-ink-muted">
                  {(["date", "order", "type", "amount", "status", "availableAt"] as const).map((c) => (
                    <th key={c} scope="col" className={`border-b border-line px-4 py-2.5 font-medium whitespace-nowrap ${c === "amount" ? "text-end" : "text-start"}`}>{t(`col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{date(e.created_at)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {e.vendor_order_id ? <Link href={`/dashboard/orders/${e.vendor_order_id}`} className="font-mono font-medium text-ink">#{e.order_display_id}</Link> : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.note === "cod_cash" ? t("type.cod_cash") : t(`type.${e.type}`)}
                      {e.note && e.note !== "cod_cash" && <span className="block text-[12px] text-ink-muted"><bdi>{e.note}</bdi></span>}
                    </td>
                    <td className={`px-4 py-2.5 text-end font-semibold whitespace-nowrap tabular-nums ${e.amount < 0 ? "text-danger" : ""}`}><bdi>{signed(e.amount)}</bdi></td>
                    <td className="px-4 py-2.5"><Badge variant={tone[e.status]}>{t(`status.${e.status}`)}</Badge></td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{e.status === "pending" ? date(e.available_at) : "—"}</td>
                  </tr>
                ))}
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

      <h2 className="m-0 mt-8 mb-3 text-[20px] leading-[28px] font-semibold">{t("history")}</h2>
      {batches.length === 0 ? (
        <p className="m-0 text-ink-muted">{t("noPayouts")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">{t("history")}</caption>
            <thead>
              <tr className="bg-ground text-[12px] text-ink-muted">
                {(["created", "amount", "status", "reference", "paidAt"] as const).map((c) => (
                  <th key={c} scope="col" className={`border-b border-line px-4 py-2.5 font-medium whitespace-nowrap ${c === "amount" ? "text-end" : "text-start"}`}>{t(`batch.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{date(b.created_at)}</td>
                  <td className="px-4 py-2.5 text-end font-semibold whitespace-nowrap tabular-nums"><bdi>{usd(b.amount)}</bdi></td>
                  <td className="px-4 py-2.5"><Badge variant={b.status === "paid" ? "success" : "warning"}>{t(`batch.${b.status}`)}</Badge></td>
                  <td className="px-4 py-2.5 font-mono"><bdi>{b.reference ?? "—"}</bdi></td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{date(b.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
