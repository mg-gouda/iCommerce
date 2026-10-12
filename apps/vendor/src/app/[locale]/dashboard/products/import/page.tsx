import { getTranslations } from "next-intl/server"
import { ImportForm } from "@/components/ImportForm"
import { PageHeader, panel } from "@/components/PageHeader"
import { Link } from "@/i18n/navigation"
import { getMe } from "@/lib/api"

const COLUMNS = "handle,title,description,category_handle,price_usd,compare_at_usd,unit,min_qty,qty_step,hs_code,b2b_only,image_urls"

const ROWS = [
  ["title", true], ["price_usd", true], ["handle", false], ["description", false], ["category_handle", false],
  ["compare_at_usd", false], ["unit", false], ["min_qty", false], ["qty_step", false], ["hs_code", false],
  ["b2b_only", false], ["image_urls", false],
] as const

export default async function ImportPage() {
  const t = await getTranslations("import")
  const { vendor } = await getMe()
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/products" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader title={t("title")} sub={t("sub")} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-6">
          <ImportForm approved={vendor.status === "approved"} />
        </div>
        <aside aria-labelledby="cols" className={`${panel} flex min-w-0 flex-[1_1_320px] flex-col gap-3`}>
          <h2 id="cols" className="m-0 text-[16px] leading-[22px] font-semibold">{t("columns")}</h2>
          <p className="m-0 text-[13px] text-ink-muted">{t("columnsSub")}</p>
          <pre dir="ltr" tabIndex={0} aria-label={t("headerRow")} className="m-0 overflow-x-auto rounded-md border border-line bg-ground p-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap break-all select-all">{COLUMNS}</pre>
          <a href="/product-import-template.csv" download className="self-start text-[13px] font-semibold text-brand-ink">{t("template")}</a>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {ROWS.map(([col, req]) => (
              <div key={col} className="contents">
                <dt dir="ltr" className="font-mono text-[12px] text-ink">{col}</dt>
                <dd className="m-0 text-ink-muted">{req ? <b className="font-semibold text-ink">{t("required")} · </b> : null}{t(`col.${col}`)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </>
  )
}
