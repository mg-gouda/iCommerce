import { getLocale, getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { CreateCompanyForm, KycForm } from "@/components/CompanyForms"
import { Link } from "@/i18n/navigation"
import { getMembership } from "@/lib/p3/api"
import type { Company } from "@/lib/p3/types"

const BADGE = { none: "neutral", submitted: "warning", verified: "success", rejected: "danger" } as const

export default async function CompanyPage() {
  const [t, locale, m] = await Promise.all([getTranslations("b2b"), getLocale(), getMembership()])

  if (!m)
    return (
      <section className="flex max-w-[720px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("createTitle")}</h2>
          <p className="m-0 max-w-[65ch] text-ink-muted">{t("createBody")}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 md:p-6">
          <CreateCompanyForm />
        </div>
        <p className="m-0 text-[14px] text-ink-muted">{t("invitedHint")}</p>
      </section>
    )

  const c = m.company
  const admin = m.member.role === "admin"
  const region = new Intl.DisplayNames([locale], { type: "region" })
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[20px] leading-[26px] font-semibold"><bdi>{c.name}</bdi></h2>
          <Link href="/account/company/members" className="ic-btn ic-btn--sm no-underline">{t("members")}</Link>
        </div>
        <KycBanner c={c} admin={admin} t={t} />
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-line bg-surface p-4 text-[14px] md:p-6">
          <dt className="text-ink-muted">{t("address")}</dt>
          <dd className="m-0">{[c.address, c.city, region.of(c.country)].filter(Boolean).join(", ")}</dd>
          <dt className="text-ink-muted">{t("phone")}</dt>
          <dd className="m-0"><bdi dir="ltr">{c.phone}</bdi></dd>
          <dt className="text-ink-muted">{t("yourRole")}</dt>
          <dd className="m-0">{t(`roles.${m.member.role}`)}</dd>
          {c.kyc_status !== "none" && (
            <>
              <dt className="text-ink-muted">{t("taxId")}</dt>
              <dd className="m-0 ic-mono"><bdi dir="ltr">{c.tax_id}</bdi></dd>
              <dt className="text-ink-muted">{t("crNo")}</dt>
              <dd className="m-0 ic-mono"><bdi dir="ltr">{c.commercial_reg_no}</bdi></dd>
              {c.export_card_no && (
                <>
                  <dt className="text-ink-muted">{t("exportCard")}</dt>
                  <dd className="m-0 ic-mono"><bdi dir="ltr">{c.export_card_no}</bdi></dd>
                </>
              )}
              <dt className="text-ink-muted">{t("documents")}</dt>
              <dd className="m-0">{c.kyc_files?.map((f) => <bdi key={f.id} className="block">{f.filename}</bdi>)}</dd>
            </>
          )}
        </dl>
      </section>

      {admin && (c.kyc_status === "none" || c.kyc_status === "rejected") && (
        <section aria-labelledby="kyc" className="flex max-w-[860px] flex-col gap-3">
          <h2 id="kyc" className="m-0 text-[20px] leading-[26px] font-semibold">{t("kycTitle")}</h2>
          <p className="m-0 max-w-[65ch] text-[14px] text-ink-muted">{t("kycBody")}</p>
          <div className="rounded-lg border border-line bg-surface p-4 md:p-6"><KycForm values={c} /></div>
        </section>
      )}
      {admin && (c.kyc_status === "submitted" || c.kyc_status === "verified") && (
        <details className="max-w-[860px] rounded-lg border border-line bg-surface p-4 md:p-6">
          <summary className="cursor-pointer font-semibold">{t("kycUpdate")}</summary>
          <p className="mt-2 mb-4 text-[14px] text-ink-muted">{t("kycUpdateNote")}</p>
          <KycForm values={c} />
        </details>
      )}
    </div>
  )
}

function KycBanner({ c, admin, t }: { c: Company; admin: boolean; t: Awaited<ReturnType<typeof getTranslations<"b2b">>> }) {
  const s = c.kyc_status
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={BADGE[s]}>{t(`kyc.${s}`)}</Badge>
        <span className="font-semibold">{t(`kycHead.${s}`)}</span>
      </div>
      <p className="m-0 max-w-[70ch] text-[14px] text-ink-muted">{t(`kycText.${s}`)}{s !== "verified" && !admin ? ` ${t("kycAskAdmin")}` : ""}</p>
      {c.kyc_note && s === "rejected" && (
        <p className="m-0 max-w-[70ch] rounded-md bg-danger-tint p-3 text-[14px] text-ink">
          <span className="font-semibold">{t("kycNote")}</span> <bdi>{c.kyc_note}</bdi>
        </p>
      )}
    </div>
  )
}
