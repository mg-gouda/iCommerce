import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { PageHeader } from "@/components/PageHeader"
import { ProductForm } from "@/components/ProductForm"
import { Link } from "@/i18n/navigation"
import { ApiError, getCategories, getMe, vendorApi } from "@/lib/api"
import { productBadge } from "@/lib/status"
import type { VendorProduct } from "@/lib/types"

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations("product")
  const ts = await getTranslations("status")
  const [{ vendor }, categories, product] = await Promise.all([
    getMe(),
    getCategories(),
    vendorApi<{ product: VendorProduct }>(`/vendors/products/${encodeURIComponent(id)}`).then(
      (r) => r.product,
      (e) => (e instanceof ApiError && e.status === 404 ? notFound() : Promise.reject(e)),
    ),
  ])
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/products" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader title={product.title} actions={<Badge variant={productBadge(product.status)}>{ts(product.status)}</Badge>} />
      <ProductForm key={product.updated_at} product={product} categories={categories} approved={vendor.status === "approved"} />
    </>
  )
}
