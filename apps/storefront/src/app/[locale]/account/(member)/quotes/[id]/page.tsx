import { notFound } from "next/navigation"
import { CircleCheck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { money, qtyUnit } from "@icommerce/ui"
import { AcceptForm, ApproveForm, CounterForm, MessageForm, RejectForm } from "@/components/QuoteForms"
import { QuoteBadge } from "@/components/QuoteStatus"
import { Link } from "@/i18n/navigation"
import { getCredit, getMembership, getQuote } from "@/lib/p3/api"

type Props = { params: Promise<{ id: string }> }

const OPEN = ["requested", "vendor_review", "offered", "negotiating", "pending_approval"]

export default async function QuotePage({ params }: Props) {
  const [res, m, t, tu, locale] = await Promise.all([getQuote((await params).id), getMembership(), getTranslations("b2b"), getTranslations("units"), getLocale()])
  if (!res || !m) notFound()
  const q = res.quote
  const cur = q.currency_code.toUpperCase()
  const role = m.member.role
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })
  const net = m.company.payment_mode === "net_terms"
  const terms = net ? (await getCredit().catch(() => null))?.credit_account?.terms_days : undefined
  const offered = q.items.some((i) => i.offered_unit_price != null)
  const qty = (n: number, unit: string | null) => (unit ? qtyUnit(tu, n, unit) : String(n))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 flex flex-wrap items-center gap-3 text-[20px] leading-[26px] font-semibold">
            <bdi>{q.vendor.name}</bdi> <QuoteBadge status={q.status} />
          </h2>
          <p className="m-0 text-[13px] text-ink-muted">
            {t("requestedOn", { date: date.format(new Date(q.created_at)) })}
            {q.requester && <> · {t("by", { name: [q.requester.first_name, q.requester.last_name].filter(Boolean).join(" ") || q.requester.email })}</>}
          </p>
        </div>
        <Link href="/account/quotes" className="text-[14px] text-brand-ink underline underline-offset-2">{t("allQuotes")}</Link>
      </div>

      {q.order_id && (
        <p role="status" className="m-0 flex flex-wrap items-center gap-2 rounded-md bg-success-tint px-4 py-3 text-[14px] text-success">
          <CircleCheck size={16} aria-hidden /> {t("ordered")}
          <Link href={`/account/orders/${q.order_id}`} className="font-semibold text-success underline underline-offset-2">{t("viewOrder")}</Link>
        </p>
      )}

      <section aria-labelledby="offer" className="flex flex-col gap-3">
        <h3 id="offer" className="m-0 text-[16px] leading-[22px] font-semibold">{offered ? t("offerTitle") : t("requestTitle")}</h3>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-[14px] tabular-nums">
            <thead>
              <tr className="border-b border-line bg-ground text-[12px] text-ink-muted">
                <th scope="col" className="px-4 py-2 text-start font-medium">{t("item")}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">{t("qty")}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">{t("target")}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">{t("offerUnit")}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">{t("leadTime")}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-b-0">
                  <th scope="row" dir="auto" className="px-4 py-3 text-start font-medium">{i.title}</th>
                  <td className="px-4 py-3 text-end"><bdi>{qty(i.quantity, i.unit)}</bdi></td>
                  <td className="px-4 py-3 text-end text-ink-muted"><bdi>{i.target_price != null ? money(i.target_price, cur) : "—"}</bdi></td>
                  <td className="px-4 py-3 text-end font-semibold"><bdi>{i.offered_unit_price != null ? money(i.offered_unit_price, cur) : "—"}</bdi></td>
                  <td className="px-4 py-3 text-end">{i.lead_time_days != null ? t("days", { n: i.lead_time_days }) : "—"}</td>
                  <td className="px-4 py-3 text-end"><bdi>{i.offered_unit_price != null ? money(i.offered_unit_price * i.quantity, cur) : "—"}</bdi></td>
                </tr>
              ))}
            </tbody>
            {q.total != null && (
              <tfoot>
                <tr className="border-t border-line-strong">
                  <th scope="row" colSpan={5} className="px-4 py-3 text-end font-semibold">{t("total")}</th>
                  <td className="px-4 py-3 text-end text-[16px] font-semibold"><bdi>{money(q.total, cur)}</bdi></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
          {q.validity_until && <div><dt className="text-ink-muted">{t("validity")}</dt><dd className="m-0 font-semibold">{date.format(new Date(q.validity_until))}</dd></div>}
          {q.incoterm && <div><dt className="text-ink-muted">{t("incoterm")}</dt><dd className="m-0 font-semibold">{q.incoterm}</dd></div>}
          <div><dt className="text-ink-muted">{t("payment")}</dt><dd className="m-0 font-semibold">{net ? t("payNet", { n: terms ?? 30 }) : t("payUpfront")}</dd></div>
          {q.notes && <div className="basis-full"><dt className="text-ink-muted">{t("notes")}</dt><dd dir="auto" className="m-0 text-start">{q.notes}</dd></div>}
        </dl>
      </section>

      {q.status === "offered" && (
        <section aria-labelledby="decide" className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface p-4 md:p-6">
          <h3 id="decide" className="m-0 text-[16px] leading-[22px] font-semibold">{t("decide")}</h3>
          <AcceptForm quote={q.id} label={t("accept", { total: money(q.total ?? 0, cur) })} help={role === "buyer" ? t("acceptHelpBuyer") : t("acceptHelp")} />
          <details className="flex flex-col gap-3 border-t border-line pt-4">
            <summary className="cursor-pointer font-semibold">{t("counter")}</summary>
            <div className="mt-3"><CounterForm quote={q.id} items={q.items} currency={cur} /></div>
          </details>
          <div className="border-t border-line pt-4"><RejectForm quote={q.id} label={t("rejectOffer")} /></div>
        </section>
      )}

      {q.status === "pending_approval" && (
        <section aria-labelledby="approve" className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface p-4 md:p-6">
          <h3 id="approve" className="m-0 text-[16px] leading-[22px] font-semibold">{t("approvalNeeded")}</h3>
          {role === "buyer" ? (
            <p className="m-0 text-[14px] text-ink-muted">{t("waitingApproval")}</p>
          ) : (
            <>
              <p className="m-0 text-[14px] text-ink-muted">{t("approveHelp", { total: money(q.total ?? 0, cur) })}</p>
              <ApproveForm quote={q.id} />
              <RejectForm quote={q.id} label={t("rejectOffer")} />
            </>
          )}
        </section>
      )}

      <section aria-labelledby="thread" className="flex max-w-[860px] flex-col gap-3">
        <h3 id="thread" className="m-0 text-[16px] leading-[22px] font-semibold">{t("thread")}</h3>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {(q.messages ?? []).map((msg) =>
            msg.author === "system" ? (
              <li key={msg.id} className="text-center text-[13px] text-ink-muted">
                <bdi>{msg.body}</bdi> · <time dateTime={msg.created_at}>{time.format(new Date(msg.created_at))}</time>
              </li>
            ) : (
              <li key={msg.id} className={`flex max-w-[85%] flex-col gap-1 rounded-lg border p-3 ${msg.author === "buyer" ? "self-end border-brand-tint bg-brand-tint" : "self-start border-line bg-surface"}`}>
                <span className="text-[12px] text-ink-muted">
                  <bdi>{msg.author === "buyer" ? (msg.author_name ?? t("you")) : q.vendor.name}</bdi> · <time dateTime={msg.created_at}>{time.format(new Date(msg.created_at))}</time>
                </span>
                <p dir="auto" className="m-0 text-start whitespace-pre-line">{msg.body}</p>
              </li>
            )
          )}
        </ol>
        {OPEN.includes(q.status) && <MessageForm quote={q.id} />}
      </section>
    </div>
  )
}
