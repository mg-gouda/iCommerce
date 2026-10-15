import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/PageHeader"
import { ProductForm } from "@/components/ProductForm"
import { Link } from "@/i18n/navigation"
import { getCategories, getMe } from "@/lib/api"

export default async function NewProductPage() {
  const t = await getTranslations("product")
  const [{ vendor, plan }, categories] = await Promise.all([getMe(), getCategories()])
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-2 text-[13px]">
        <Link href="/dashboard/products" className="text-brand-ink underline underline-offset-2">{t("back")}</Link>
      </nav>
      <PageHeader title={t("newTitle")} />
      <ProductForm categories={categories} approved={vendor.status === "approved"} canB2b={plan.can_b2b} />
    </>
  )
}
