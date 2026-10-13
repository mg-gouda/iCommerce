import { notFound } from "next/navigation"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { PageHeader, panel } from "@/components/PageHeader"
import { MessageForm, OfferForm, RejectQuoteForm } from "@/components/QuoteActions"
import { Link } from "@/i18n/navigation"
import { ApiError, vendorApi } from "@/lib/api"
import { quoteBadge, quoteRef } from "@/lib/status"
import type { Quote, QuoteStatus } from "@/lib/types"

const h2 = "m-0 mb-3 text-[16px] leading-[22px] font-semibold"
const OFFERABLE: QuoteStatus[] = ["requested", "vendor_review", "negotiating"]
const OPEN: QuoteStatus[] = [...OFFERABLE, "offered", "pending_approval"]
const fmtQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 })

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations("quotes")
  const format = await getFormatter()
  const locale = await getLocale()
  const q = await vendorApi<{ quote: Quote }>(`/vendors/quotes/${encodeURIComponent(id)}`).then(
    (r) => r.quote,
    (e) => (e instanceof ApiError && e.status === 404 ? notFound() : Promise.reject(e)),
  )
  const cur = q.currency_code.toUpperCase()
  const date = (s: string) => format.dateTime(new Date(s), { dateStyle: "medium", timeStyle: "short" })
  const offered = q.items.some((i) => i.offered_unit_price != null)
  const requester = [q.requester?.first_name, q.requester?.last_name].filter(Boolean).join(" ")

  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/quotes" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader
        title={<>{t("quoteTitle")} <bdi dir="ltr" className="font-mono">{quoteRef(q.id)}</bdi></>}
        sub={t("received", { date: date(q.created_at) })}
        actions={<Badge variant={quoteBadge(q.status)}>{t(`status.${q.status}`)}</Badge>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="items" className="overflow-x-auto rounded-lg border border-line bg-surface">
            <h2 id="items" className="sr-only">{t("items")}</h2>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="bg-ground text-[12px] text-ink-muted">
                  {(["product", "qty", "target", "offer", "lead"] as const).map((c, i) => (
                    <th key={c} scope="col" className={`border-b border-line px-4 py-2.5 font-medium whitespace-nowrap ${i ? "text-end" : "text-start"}`}>{t(`col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.items.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{i.title}{!i.product_id && <span className="ms-2 text-[12px] font-normal text-ink-muted">{t("customItem")}</span>}</td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums"><bdi>{fmtQty(i.quantity)} {i.unit ?? ""}</bdi></td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums">{i.target_price != null ? <bdi>{money(i.target_price, cur)}</bdi> : "—"}</td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums">{i.offered_unit_price != null ? <bdi>{money(i.offered_unit_price, cur)}</bdi> : "—"}</td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums">{i.lead_time_days != null ? t("daysN", { n: i.lead_time_days }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {q.total != null && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4} className="px-4 pt-2 pb-3 text-end font-semibold">{t("offerTotal")}</th>
                    <td className="px-4 pt-2 pb-3 text-end text-[16px] font-semibold whitespace-nowrap tabular-nums"><bdi>{money(q.total, cur)}</bdi></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>

          {OFFERABLE.includes(q.status) && (
            <section aria-labelledby="offer" className={panel}>
              <h2 id="offer" className={h2}>{offered ? t("reviseOffer") : t("makeOffer")}</h2>
              {q.status === "negotiating" && <p role="note" className="m-0 mb-4 rounded-md bg-warning-tint p-3 text-[13px]">{t("counterNote")}</p>}
              <OfferForm quote={q} />
            </section>
          )}
          {q.status === "offered" && <p role="note" className={`${panel} m-0 text-[14px]`}>{t("waitingBuyer")}</p>}
          {q.status === "pending_approval" && <p role="note" className={`${panel} m-0 text-[14px]`}>{t("waitingApproval")}</p>}
          {q.status === "ordered" && q.order_id && <p role="note" className={`${panel} m-0 text-[14px]`}>{t("orderedNote")} <Link href="/dashboard/orders" className="text-brand-ink underline underline-offset-2">{t("openOrders")}</Link></p>}

          <section aria-labelledby="thread" className={panel}>
            <h2 id="thread" className={h2}>{t("thread")}</h2>
            <ol className="m-0 mb-4 flex list-none flex-col gap-3 p-0">
              {(q.messages ?? []).map((m) =>
                m.author === "system" ? (
                  <li key={m.id} className="text-center text-[12px] text-ink-muted">
                    {t.has(`event.${m.body}`) ? t(`event.${m.body}`) : m.body} · <time dateTime={m.created_at}>{date(m.created_at)}</time>
                  </li>
                ) : (
                  <li key={m.id} className={`max-w-[85%] rounded-lg border border-line p-3 text-[14px] ${m.author === "vendor" ? "ms-auto bg-ground" : "me-auto bg-surface"}`}>
                    <p className="m-0 mb-1 text-[12px] text-ink-muted">
                      <bdi className="font-medium text-ink">{m.author === "vendor" ? t("you") : (m.author_name ?? t("buyer"))}</bdi> · <time dateTime={m.created_at}>{date(m.created_at)}</time>
                    </p>
                    <p className="m-0 whitespace-pre-wrap"><bdi>{m.body}</bdi></p>
                  </li>
                ),
              )}
            </ol>
            {OPEN.includes(q.status) && <MessageForm id={q.id} />}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="buyer" className={panel}>
            <h2 id="buyer" className={h2}>{t("buyerTitle")}</h2>
            <p className="m-0 text-[14px] leading-[22px]">
              <bdi className="font-medium">{q.company?.name}</bdi>
              {q.company && <><br />{[q.company.city, new Intl.DisplayNames([locale], { type: "region" }).of(q.company.country)].filter(Boolean).join(", ")}</>}
              {requester && <><br /><bdi>{requester}</bdi></>}
              {q.requester?.email && <><br /><a href={`mailto:${q.requester.email}`} dir="ltr" className="text-brand-ink">{q.requester.email}</a></>}
            </p>
            <Badge variant="verified" className="mt-3">{t("verifiedCompany")}</Badge>
          </section>
          <section aria-labelledby="terms" className={panel}>
            <h2 id="terms" className={h2}>{t("terms")}</h2>
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[14px]">
              <dt className="text-ink-muted">{t("incoterm")}</dt><dd className="m-0">{q.incoterm ?? "—"}</dd>
              <dt className="text-ink-muted">{t("validUntil")}</dt><dd className="m-0">{q.validity_until ? format.dateTime(new Date(q.validity_until), { dateStyle: "medium" }) : "—"}</dd>
            </dl>
            {q.notes && <p className="m-0 mt-3 text-[14px]"><span className="text-ink-muted">{t("buyerNotes")}:</span> <bdi className="whitespace-pre-wrap">{q.notes}</bdi></p>}
          </section>
          {[...OFFERABLE, "offered"].includes(q.status) && (
            <section aria-labelledby="decline" className={panel}>
              <h2 id="decline" className={h2}>{t("declineTitle")}</h2>
              <p className="m-0 mb-3 text-[13px] text-ink-muted">{t("declineHelp")}</p>
              <RejectQuoteForm id={q.id} />
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
