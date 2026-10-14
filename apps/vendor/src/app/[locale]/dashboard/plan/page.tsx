import { Check, CircleAlert, Minus } from "lucide-react"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { Badge, type BadgeProps, money } from "@icommerce/ui"
import { PageHeader, panel } from "@/components/PageHeader"
import { vendorApi } from "@/lib/api"
import { requestUpgrade } from "@/lib/plan-actions"
import type { Plan, Subscription, SubscriptionStatus } from "@/lib/types"

type PlanPage = { subscription: Subscription; plan: Plan | null; usage: { products: number; staff: number }; plans: Plan[]; grace_until: string | null }
const tone: Record<SubscriptionStatus, NonNullable<BadgeProps["variant"]>> = { trial: "neutral", active: "success", past_due: "danger", cancelled: "neutral" }

function Meter({ label, used, limit, unlimited }: { label: string; used: number; limit: number | null; unlimited: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-[14px]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-ink-muted">{limit == null ? `${used} · ${unlimited}` : `${used} / ${limit}`}</span>
      </div>
      {limit != null && (
        <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} className="h-2 overflow-hidden rounded-full bg-ground">
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-brand"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ requested?: string; error?: string }> }) {
  const sp = await searchParams
  const t = await getTranslations("plan")
  const tErr = await getTranslations("errors")
  const format = await getFormatter()
  const locale = await getLocale()
  const { subscription: sub, plan, usage, plans, grace_until } = await vendorApi<PlanPage>("/vendors/plan")
  const name = (p: Plan | null) => (p ? (locale === "ar" ? p.name_ar : p.name_en) : "—")
  const price = (p: Plan) => (p.price_usd ? t("price", { amount: money(p.price_usd, "USD"), interval: t(`interval.${p.interval}`) }) : t("free"))
  const date = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium" })
  const features = (p: Plan) => [
    [t("feature.products", { count: p.product_limit ?? -1 }), true],
    [t("feature.staff", { count: p.staff_limit ?? -1 }), true],
    [t("feature.b2b"), p.can_b2b],
    [t("feature.featured", { count: p.featured_slots }), p.featured_slots > 0],
    [t(`feature.analytics.${p.analytics_level}`), true],
  ] as const

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      {sp.requested && <p role="status" className="mb-4 rounded-lg border border-line bg-brand-tint p-4 text-ink">{t("requested")}</p>}
      {sp.error && (
        <p role="alert" className="ic-error mb-4"><CircleAlert aria-hidden /> <span>{tErr.has(sp.error) ? tErr(sp.error) : sp.error}</span></p>
      )}

      <section aria-labelledby="current" className={`${panel} mb-6 grid gap-6 md:grid-cols-2`}>
        <div className="flex flex-col gap-2">
          <h2 id="current" className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{t("current")}</h2>
          <p className="m-0 flex flex-wrap items-center gap-2 text-[24px] leading-[32px] font-semibold">
            {name(plan)} <Badge variant={tone[sub.status]}>{t(`status.${sub.status}`)}</Badge>
          </p>
          {plan && <p className="m-0 text-ink-muted"><bdi>{price(plan)}</bdi></p>}
          {sub.current_period_end && <p className="m-0 text-[14px]">{t(sub.status === "trial" ? "trialEnds" : "periodEnds", { date: date(sub.current_period_end) })}</p>}
          {sub.status === "past_due" && grace_until && (
            <p className="m-0 text-[14px] text-danger">{t(sub.read_only ? "readOnly" : "graceUntil", { date: date(grace_until) })}</p>
          )}
          {sub.requested_plan_id && <p className="m-0 text-[14px] text-ink-muted">{t("pending", { plan: name(plans.find((p) => p.id === sub.requested_plan_id) ?? null) })}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{t("usage")}</h2>
          <Meter label={t("products")} used={usage.products} limit={plan?.product_limit ?? null} unlimited={t("unlimited")} />
          <Meter label={t("staff")} used={usage.staff} limit={plan?.staff_limit ?? null} unlimited={t("unlimited")} />
        </div>
      </section>

      <h2 className="m-0 mb-3 text-[20px] leading-[28px] font-semibold">{t("compare")}</h2>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {plans.map((p) => {
          const mine = p.id === plan?.id
          return (
            <li key={p.id} className={`${panel} flex flex-col gap-3 ${mine ? "border-brand" : ""}`}>
              <div>
                <h3 className="m-0 text-[18px] leading-[24px] font-semibold">{name(p)}</h3>
                <p className="m-0 text-ink-muted"><bdi>{price(p)}</bdi></p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
                {features(p).map(([label, on]) => (
                  <li key={label} className={`flex items-start gap-2 ${on ? "" : "text-ink-muted"}`}>
                    {on ? <Check size={16} aria-hidden className="mt-0.5 flex-none text-success" /> : <Minus size={16} aria-hidden className="mt-0.5 flex-none" />}
                    <span>{on ? label : t("notIncluded", { feature: label })}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {mine ? (
                  <p className="m-0 text-[14px] font-semibold text-brand-ink">{t("yourPlan")}</p>
                ) : sub.requested_plan_id === p.id ? (
                  <p className="m-0 text-[14px] text-ink-muted">{t("requestSent")}</p>
                ) : (
                  <form action={requestUpgrade}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="plan_id" value={p.id} />
                    <button type="submit" className="ic-btn ic-btn--sm">{t("request", { plan: name(p) })}</button>
                  </form>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="m-0 mt-4 max-w-[70ch] text-[13px] text-ink-muted">{t("billingNote")}</p>
    </>
  )
}
