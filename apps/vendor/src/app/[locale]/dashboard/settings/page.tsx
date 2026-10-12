import { ChevronRight } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { PageHeader } from "@/components/PageHeader"
import { ProfileForm } from "@/components/StoreForms"
import { Link } from "@/i18n/navigation"
import { getMe } from "@/lib/api"
import { kycBadge } from "@/lib/status"

export default async function SettingsPage() {
  const t = await getTranslations("settings")
  const tk = await getTranslations("kyc")
  const tsh = await getTranslations("shipping")
  const { vendor } = await getMe()
  const [variant, label] = kycBadge(vendor.kyc_status)
  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      <Link
        href="/dashboard/settings/kyc"
        className="mb-6 flex max-w-[880px] items-center gap-3 rounded-lg border border-line bg-surface p-4 text-ink no-underline hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">{tk("title")}</span>
          <span className="text-[13px] text-ink-muted">{tk("linkSub")}</span>
        </div>
        <Badge variant={variant}>{tk(`status.${label}`)}</Badge>
        <ChevronRight size={20} aria-hidden className="flex-none text-ink-muted rtl:-scale-x-100" />
      </Link>
      <Link
        href="/dashboard/settings/shipping"
        className="mb-6 flex max-w-[880px] items-center gap-3 rounded-lg border border-line bg-surface p-4 text-ink no-underline hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">{tsh("title")}</span>
          <span className="text-[13px] text-ink-muted">{tsh("linkSub")}</span>
        </div>
        <ChevronRight size={20} aria-hidden className="flex-none text-ink-muted rtl:-scale-x-100" />
      </Link>
      <h2 className="m-0 mb-3 text-[20px] leading-[26px] font-semibold">{t("profile")}</h2>
      <ProfileForm vendor={vendor} />
    </>
  )
}
