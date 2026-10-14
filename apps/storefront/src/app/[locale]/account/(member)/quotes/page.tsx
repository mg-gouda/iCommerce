import { Check } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { money } from "@icommerce/ui"
import { QuoteBadge } from "@/components/QuoteStatus"
import { Link, redirect } from "@/i18n/navigation"
import { getMembership, listQuotes } from "@/lib/p3/api"
import type { Quote } from "@/lib/p3/types"

type Props = { searchParams: Promise<{ rfq?: string }> }

export default async function QuotesPage({ searchParams }: Props) {
  const [t, locale, m, { rfq }] = await Promise.all([getTranslations("b2b"), getLocale(), getMembership(), searchParams])
  if (!m) redirect({ href: "/account/company", locale })
  const approver = m!.member.role !== "buyer"
  // ponytail: newest 50; pagination when a company has more open quotes.
  const { quotes } = await listQuotes()
  const pending = approver ? quotes.filter((q) => q.status === "pending_approval") : []
  const fromRfq = rfq ? quotes.filter((q) => q.rfq_id === rfq) : []
  const sent = fromRfq.filter((q) => q.vendor).length
  const routing = fromRfq.find((q) => q.status === "routing")?.items.length ?? 0
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })

  const list = (items: Quote[]) => (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((q) => (
        <li key={q.id}>
          <Link href={`/account/quotes/${q.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 text-ink no-underline hover:border-line-strong">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{q.vendor ? <bdi>{q.vendor.name}</bdi> : t("sourcing")}</span>
              <span dir="auto" className="truncate text-start text-[13px] text-ink-muted">{q.items.map((i) => i.title).join(", ")}</span>
              <span className="text-[13px] text-ink-muted">{date.format(new Date(q.created_at))} · {t("itemsN", { n: q.items.length })}</span>
            </span>
            <span className="flex items-center gap-3">
              {q.total != null && <bdi className="font-semibold tabular-nums">{money(q.total, q.currency_code.toUpperCase())}</bdi>}
              <QuoteBadge quote={q} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex flex-col gap-6">
      {sent + routing > 0 && (
        <p role="status" className="m-0 flex items-center gap-2 rounded-md bg-success-tint px-4 py-3 text-[14px] text-success">
          <Check size={16} aria-hidden className="shrink-0" /> {[sent && t("rfqSent", { n: sent }), routing && t("rfqRouting", { n: routing })].filter(Boolean).join(" ")}
        </p>
      )}
      {pending.length > 0 && (
        <section aria-labelledby="approvals" className="flex flex-col gap-3">
          <h2 id="approvals" className="m-0 text-[20px] leading-[26px] font-semibold">{t("approvals")}</h2>
          <p className="m-0 text-[14px] text-ink-muted">{t("approvalsBody")}</p>
          {list(pending)}
        </section>
      )}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("quotes")}</h2>
          <Link href="/account/rfq" className="ic-btn ic-btn--sm no-underline">{t("newRfq")}</Link>
        </div>
        {quotes.length ? list(quotes) : <p className="m-0 max-w-[65ch] text-ink-muted">{t("noQuotes")}</p>}
      </section>
    </div>
  )
}
