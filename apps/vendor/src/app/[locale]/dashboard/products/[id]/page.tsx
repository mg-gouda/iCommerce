import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { PageHeader, panel } from "@/components/PageHeader"
import { ProductForm } from "@/components/ProductForm"
import { WholesaleTiers } from "@/components/WholesaleTiers"
import { Link } from "@/i18n/navigation"
import { ApiError, getCategories, getMe, vendorApi } from "@/lib/api"
import { productBadge } from "@/lib/status"
import type { VendorProduct, WholesaleTier } from "@/lib/types"

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations("product")
  const ts = await getTranslations("status")
  const tt = await getTranslations("tiers")
  const [{ vendor }, categories, product, { tiers }] = await Promise.all([
    getMe(),
    getCategories(),
    vendorApi<{ product: VendorProduct }>(`/vendors/products/${encodeURIComponent(id)}`).then(
      (r) => r.product,
      (e) => (e instanceof ApiError && e.status === 404 ? notFound() : Promise.reject(e)),
    ),
    vendorApi<{ tiers: WholesaleTier[] }>(`/vendors/products/${encodeURIComponent(id)}/wholesale-tiers`).catch(() => ({ tiers: [] })),
  ])
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/products" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader title={product.title} actions={<Badge variant={productBadge(product.status)}>{ts(product.status)}</Badge>} />
      <ProductForm key={product.updated_at} product={product} categories={categories} approved={vendor.status === "approved"} />
      <section aria-labelledby="tiers" className={`${panel} mt-6 max-w-[720px]`}>
        <h2 id="tiers" className="m-0 text-[16px] leading-[22px] font-semibold">{tt("title")}</h2>
        <p className="m-0 mt-1 mb-4 max-w-[65ch] text-[13px] text-ink-muted">{tt("sub")}</p>
        <WholesaleTiers productId={product.id} tiers={tiers} unit={product.product_extra?.unit ?? tt("units")} />
      </section>
    </>
  )
}
