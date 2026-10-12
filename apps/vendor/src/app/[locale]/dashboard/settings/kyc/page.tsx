import { FileText } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { PageHeader } from "@/components/PageHeader"
import { KycForm } from "@/components/StoreForms"
import { Link } from "@/i18n/navigation"
import { getMe } from "@/lib/api"
import { kycBadge } from "@/lib/status"

export default async function KycPage() {
  const t = await getTranslations("kyc")
  const { vendor } = await getMe()
  const [variant, label] = kycBadge(vendor.kyc_status)
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/settings" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader title={t("title")} sub={t("sub")} actions={<Badge variant={variant}>{t(`status.${label}`)}</Badge>} />
      {!!vendor.kyc_files?.length && (
        <section aria-labelledby="kyc-files" className="mb-6 max-w-[640px]">
          <h2 id="kyc-files" className="m-0 mb-2 text-[16px] leading-[22px] font-semibold">{t("onFile")}</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {vendor.kyc_files.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <FileText size={16} aria-hidden className="text-ink-muted" />
                <bdi>{f.filename}</bdi>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[13px] text-ink-muted">{t("replaceNote")}</p>
        </section>
      )}
      <KycForm vendor={vendor} />
    </>
  )
}
