import Image from "next/image"
import { Package, Search } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Badge, money } from "@icommerce/ui"
import { DeleteProduct } from "@/components/DeleteProduct"
import { PageHeader } from "@/components/PageHeader"
import { Saved } from "@/components/StoreForms"
import { Link } from "@/i18n/navigation"
import { vendorApi } from "@/lib/api"
import { productBadge } from "@/lib/status"
import type { ProductStatus, VendorProduct } from "@/lib/types"

const LIMIT = 20
const STATUSES: ProductStatus[] = ["draft", "proposed", "published", "rejected"]

type SP = { q?: string; status?: string; page?: string; saved?: string }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const t = await getTranslations("products")
  const ts = await getTranslations("status")
  const status = STATUSES.includes(sp.status as ProductStatus) ? sp.status : ""
  const page = Math.max(1, Number(sp.page) || 1)
  const qs = new URLSearchParams({ limit: String(LIMIT), offset: String((page - 1) * LIMIT) })
  if (sp.q) qs.set("q", sp.q)
  if (status) qs.set("status", status)
  const { products, count } = await vendorApi<{ products: VendorProduct[]; count: number }>(`/vendors/products?${qs}`)
  const pages = Math.max(1, Math.ceil(count / LIMIT))
  const pageHref = (p: number) => ({ pathname: "/dashboard/products", query: { ...(sp.q && { q: sp.q }), ...(status && { status }), page: p } })
  const filtered = !!(sp.q || status)

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Link href="/dashboard/products/import" className="ic-btn no-underline">{t("import")}</Link>
            <Link href="/dashboard/products/new" className="ic-btn ic-btn--primary no-underline">{t("add")}</Link>
          </>
        }
      />
      {sp.saved && <p className="m-0 mb-4"><Saved show label={t("created")} /></p>}

      <form role="search" className="mb-4 flex flex-wrap items-end gap-3" action="">
        <div className="ic-field min-w-[220px] flex-[1_1_280px]">
          <label htmlFor="q" className="ic-label">{t("search")}</label>
          <input id="q" name="q" type="search" defaultValue={sp.q} className="ic-input" placeholder={t("searchPlaceholder")} />
        </div>
        <div className="ic-field">
          <label htmlFor="status" className="ic-label">{t("statusFilter")}</label>
          <select id="status" name="status" defaultValue={status} className="ic-input w-auto">
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{ts(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="ic-btn">
          <Search size={16} aria-hidden /> {t("apply")}
        </button>
      </form>

      {products.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6 md:p-8">
          <Package size={24} className="text-ink-muted" aria-hidden />
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{filtered ? t("noMatchTitle") : t("emptyTitle")}</h2>
          <p className="m-0 max-w-[60ch] text-ink-muted">{filtered ? t("noMatchBody") : t("emptyBody")}</p>
        </section>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-[14px]">
              <caption className="sr-only">{t("caption", { count })}</caption>
              <thead>
                <tr className="bg-ground text-[12px] text-ink-muted">
                  {(["product", "price", "moq", "status", "actions"] as const).map((c) => (
                    <th key={c} scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium whitespace-nowrap last:text-end">
                      {c === "actions" ? <span className="sr-only">{t(`col.${c}`)}</span> : t(`col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const price = p.variants[0]?.prices.find((x) => x.currency_code === "usd")?.amount
                  const e = p.product_extra
                  return (
                    <tr key={p.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-[220px] items-center gap-3">
                          {p.thumbnail ? (
                            <Image src={p.thumbnail} alt="" width={48} height={36} className="h-9 w-12 flex-none rounded-sm object-cover" />
                          ) : (
                            <span className="h-9 w-12 flex-none rounded-sm bg-ground" />
                          )}
                          <div className="min-w-0">
                            <Link href={`/dashboard/products/${p.id}`} className="font-medium text-ink">{p.title}</Link>
                            <div className="text-[12px] text-ink-muted">
                              {p.categories[0]?.name ?? t("noCategory")}
                              {e?.b2b_only && <> · <Badge variant="b2b">B2B</Badge></>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                        {price != null ? <bdi>{money(price, "USD")}{e?.unit ? ` / ${e.unit}` : ""}</bdi> : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{e?.min_qty ? <bdi>{e.min_qty}{e.unit ? ` ${e.unit}` : ""}</bdi> : "—"}</td>
                      <td className="px-4 py-2.5"><Badge variant={productBadge(p.status)}>{ts(p.status)}</Badge></td>
                      <td className="px-4 py-2.5 text-end whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/products/${p.id}`} className="ic-btn ic-btn--sm ic-btn--ghost no-underline" aria-label={t("editLabel", { title: p.title })}>{t("edit")}</Link>
                          <DeleteProduct id={p.id} title={p.title} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
            <span>{t("pageOf", { page, pages, count })}</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={pageHref(page - 1)} className="ic-btn ic-btn--sm no-underline" rel="prev">{t("prev")}</Link>}
              {page < pages && <Link href={pageHref(page + 1)} className="ic-btn ic-btn--sm no-underline" rel="next">{t("next")}</Link>}
            </span>
          </nav>
        </>
      )}
    </>
  )
}
