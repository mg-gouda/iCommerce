import { FileText, Search } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { PageHeader } from "@/components/PageHeader"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import { quoteBadge, quoteRef as ref } from "@/lib/status"
import type { Quote, QuoteStatus } from "@/lib/types"

const LIMIT = 20
const STATUSES: QuoteStatus[] = ["requested", "vendor_review", "negotiating", "offered", "pending_approval", "ordered", "rejected", "expired"]

type SP = { q?: string; status?: string; page?: string }

export default async function QuotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const t = await getTranslations("quotes")
  const format = await getFormatter()
  const status = STATUSES.includes(sp.status as QuoteStatus) ? sp.status : ""
  const page = Math.max(1, Number(sp.page) || 1)
  const qs = new URLSearchParams({ limit: String(LIMIT), offset: String((page - 1) * LIMIT) })
  if (sp.q) qs.set("q", sp.q)
  if (status) qs.set("status", status)
  const { quotes, count } = await vendorApi<{ quotes: Quote[]; count: number }>(`/vendors/quotes?${qs}`)
  const pages = Math.max(1, Math.ceil(count / LIMIT))
  const pageHref = (p: number) => ({ pathname: "/dashboard/quotes", query: { ...(sp.q && { q: sp.q }), ...(status && { status }), page: p } })
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

      {quotes.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6 md:p-8">
          <FileText size={24} className="text-ink-muted" aria-hidden />
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
                  {(["quote", "received", "company", "items", "total", "validity", "status"] as const).map((c) => (
                    <th key={c} scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium whitespace-nowrap">{t(`col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link href={`/dashboard/quotes/${q.id}`} className="font-mono font-medium text-ink" dir="ltr">{ref(q.id)}</Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{format.dateTime(new Date(q.created_at), { dateStyle: "medium" })}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <bdi>{q.company?.name}</bdi>
                      {q.company?.city && <span className="text-[12px] text-ink-muted"> · <bdi>{q.company.city}</bdi></span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="line-clamp-1 max-w-[32ch]">{q.items.map((i) => i.title).join(", ")}</span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                      {q.total != null ? <bdi>{money(q.total, q.currency_code.toUpperCase())}</bdi> : <span className="font-normal text-ink-muted">{t("noOffer")}</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{q.validity_until ? format.dateTime(new Date(q.validity_until), { dateStyle: "medium" }) : "—"}</td>
                    <td className="px-4 py-2.5"><Badge variant={quoteBadge(q.status)}>{t(`status.${q.status}`)}</Badge></td>
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
    </>
  )
}
