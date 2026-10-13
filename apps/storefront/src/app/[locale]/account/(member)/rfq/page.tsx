import { getTranslations } from "next-intl/server"
import { RfqReviewForm, type ReviewLine } from "@/components/RfqReviewForm"
import { RfqQuickForm } from "@/components/RfqForms"
import { Link } from "@/i18n/navigation"
import { buyingMode, rfqDraft } from "@/lib/p3/mode"
import { searchProducts } from "@/lib/search"
import { productsById } from "@/lib/store"

/** Suppliers whose live products match free text. ponytail: search-hit vendors (≤6), not a supplier directory. */
async function suggest(q: string) {
  const { hits } = await searchProducts({ q, limit: 40 }).catch(() => ({ hits: [] }))
  const seen = new Map<string, string>()
  for (const h of hits) if (h.vendor_handle && !seen.has(h.vendor_handle)) seen.set(h.vendor_handle, h.vendor_name ?? h.vendor_handle)
  return [...seen].slice(0, 6).map(([handle, name]) => ({ handle, name }))
}

export default async function RfqPage() {
  const [t, draft, { membership, verified }] = await Promise.all([getTranslations("b2b"), rfqDraft(), buyingMode()])
  const products = await productsById(draft.map((d) => d.product_id))
  const lines: ReviewLine[] = await Promise.all(
    draft.map(async (d) => {
      const p = d.product_id ? products.get(d.product_id) : undefined
      if (d.product_id)
        return { title: p?.title ?? t("unavailable"), quantity: d.quantity, unit: p?.product_extra?.unit ?? null, vendor: p?.vendor?.name ?? null, moq: p?.product_extra?.min_qty ?? null }
      return { title: d.title ?? "", quantity: d.quantity, unit: d.unit ?? null, vendor: null, moq: null, suggest: await suggest(d.title ?? "") }
    })
  )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("rfqReview")}</h2>
        <p className="m-0 max-w-[70ch] text-[14px] text-ink-muted">{t("rfqReviewBody")}</p>
      </div>
      {!verified && (
        <p role="status" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-brand-tint px-4 py-3 text-[14px] text-brand-ink">
          <span className="font-semibold">{membership ? t("rfqNeedsVerify") : t("rfqNeedsCompany")}</span>
          <Link href="/account/company" className="text-brand-ink underline underline-offset-2">{membership ? t("gateVerify") : t("createCompany")}</Link>
        </p>
      )}
      {lines.length ? (
        <RfqReviewForm lines={lines} canSubmit={verified} />
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex max-w-[56ch] flex-[1_1_320px] flex-col gap-2">
            <h3 className="m-0 text-[16px] leading-[22px] font-semibold">{t("rfqEmptyTitle")}</h3>
            <p className="m-0 text-[14px] text-ink-muted">{t("rfqEmptyBody")}</p>
            <Link href="/search" className="ic-btn self-start no-underline">{t("browse")}</Link>
          </div>
          <div className="flex-[1_1_320px] rounded-lg bg-navy p-6 text-on-navy">
            <RfqQuickForm />
          </div>
        </div>
      )}
    </section>
  )
}
