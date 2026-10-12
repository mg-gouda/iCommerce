import { CircleAlert, Clock, ShieldOff, type LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import type { Vendor } from "@/lib/types"

type Kind = "kycNeeded" | "kycReview" | "kycRejected" | "suspended"

export function bannerKind(v: Pick<Vendor, "status" | "kyc_status">): Kind | null {
  if (v.status === "suspended") return "suspended"
  if (v.kyc_status === "rejected") return "kycRejected"
  if (v.status === "approved") return null
  return v.kyc_status === "submitted" ? "kycReview" : "kycNeeded"
}

const look: Record<Kind, [LucideIcon, string]> = {
  kycNeeded: [CircleAlert, "border-warning bg-warning-tint text-warning"],
  kycReview: [Clock, "border-line bg-brand-tint text-brand-ink"],
  kycRejected: [CircleAlert, "border-danger bg-danger-tint text-danger"],
  suspended: [ShieldOff, "border-danger bg-danger-tint text-danger"],
}

/** Onboarding state above every dashboard page until the store is approved. Icon + words, never color alone. */
export function StatusBanner({ vendor }: { vendor: Vendor }) {
  const t = useTranslations("banner")
  const kind = bannerKind(vendor)
  if (!kind) return null
  const [Icon, cls] = look[kind]
  return (
    <section role="status" aria-labelledby="banner-title" className={`mb-6 flex gap-3 rounded-lg border p-4 ${cls}`}>
      <Icon size={20} aria-hidden className="mt-0.5 flex-none" />
      <div className="flex min-w-0 flex-col gap-1 text-ink">
        <h2 id="banner-title" className="m-0 text-[16px] leading-[22px] font-semibold">{t(`${kind}.title`)}</h2>
        <p className="m-0 max-w-[70ch]">{t(`${kind}.body`)}</p>
        {vendor.kyc_note && (kind === "kycRejected" || kind === "suspended") && (
          <p className="m-0 max-w-[70ch]">
            <b className="font-semibold">{t("note")}</b> {vendor.kyc_note}
          </p>
        )}
        {kind !== "suspended" && kind !== "kycReview" && (
          <Link href="/dashboard/settings/kyc" className="mt-1 self-start font-semibold text-brand-ink">
            {t(`${kind}.cta`)}
          </Link>
        )}
      </div>
    </section>
  )
}
