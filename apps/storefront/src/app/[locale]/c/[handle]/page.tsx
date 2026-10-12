import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Breadcrumbs, Header } from "@/components/Header"
import { ProductGrid, tileFromProduct } from "@/components/ProductGrid"
import { getCategory, listProducts } from "@/lib/store"

type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCategory((await params).handle)
  return c ? { title: `${c.name} · iCommerce` } : {}
}

export default async function CategoryPage({ params }: Props) {
  const category = await getCategory((await params).handle)
  if (!category) notFound()
  const t = await getTranslations("category")
  // ponytail: first 48 newest, no pagination until categories hold more (WP migration).
  const { products, count } = await listProducts({ category_id: [category.id], limit: 48 })
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ href: "/", label: t("home") }, { label: category.name }]} />
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{category.name}</h1>
          <span className="text-[13px] text-ink-muted">{t("count", { count })}</span>
        </div>
        {products.length ? <ProductGrid tiles={products.map(tileFromProduct)} /> : <p className="m-0 text-ink-muted">{t("empty")}</p>}
      </main>
    </>
  )
}
