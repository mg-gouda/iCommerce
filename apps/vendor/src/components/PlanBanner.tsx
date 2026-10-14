import { CircleAlert, Lock } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import type { PlanState } from "@/lib/types"

/** Past-due plan: warning during the grace period, read-only (products hidden) after it. Icon + words, never color alone. */
export function PlanBanner({ plan }: { plan: PlanState }) {
  const t = useTranslations("banner.plan")
  if (!plan.past_due) return null
  const kind = plan.read_only ? "readOnly" : "pastDue"
  const Icon = plan.read_only ? Lock : CircleAlert
  return (
    <section role="status" aria-labelledby="plan-banner" className={`mb-6 flex gap-3 rounded-lg border p-4 ${plan.read_only ? "border-danger bg-danger-tint text-danger" : "border-warning bg-warning-tint text-warning"}`}>
      <Icon size={20} aria-hidden className="mt-0.5 flex-none" />
      <div className="flex min-w-0 flex-col gap-1 text-ink">
        <h2 id="plan-banner" className="m-0 text-[16px] leading-[22px] font-semibold">{t(`${kind}.title`)}</h2>
        <p className="m-0 max-w-[70ch]">{t(`${kind}.body`)}</p>
        <Link href="/dashboard/plan" className="mt-1 self-start font-semibold text-brand-ink">{t("cta")}</Link>
      </div>
    </section>
  )
}
