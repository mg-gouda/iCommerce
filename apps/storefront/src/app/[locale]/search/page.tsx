import { getTranslations } from "next-intl/server"
import { Breadcrumbs, Header } from "@/components/Header"
import { ProductGrid, tileFromDoc } from "@/components/ProductGrid"
import { Link } from "@/i18n/navigation"
import { searchProducts } from "@/lib/search"

type SP = { q?: string; category?: string }

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { q = "", category } = await searchParams
  const t = await getTranslations("search")
  const { hits, total, categories } = await searchProducts({ q, category })
  const facetHref = (c?: string) => ({ pathname: "/search", query: { ...(q && { q }), ...(c && { category: c }) } })
  const facet = "flex justify-between gap-3 rounded-md px-3 py-1.5 text-[14px] no-underline hover:bg-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-[current=true]:bg-brand-tint aria-[current=true]:font-semibold aria-[current=true]:text-brand-ink"

  return (
    <>
      <Header q={q} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ href: "/", label: t("home") }, { label: t("title") }]} />
        <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">
          {q ? t("resultsFor", { q }) : t("all")}
        </h1>
        <p className="m-0 text-[13px] text-ink-muted" role="status">{t("count", { count: total })}</p>
        <div className="flex flex-wrap items-start gap-6">
          <nav aria-label={t("categories")} className="flex min-w-0 flex-[1_1_200px] flex-col gap-1 md:max-w-[240px]">
            <h2 className="m-0 mb-1 px-3 text-[13px] font-semibold text-ink-muted">{t("categories")}</h2>
            <Link href={facetHref()} aria-current={!category || undefined} className={`${facet} text-ink`}>
              {t("allCategories")}
            </Link>
            {Object.entries(categories).map(([name, n]) => (
              <Link key={name} href={facetHref(name)} aria-current={category === name || undefined} className={`${facet} text-ink`}>
                <span>{name}</span>
                <span className="tabular-nums text-ink-muted">{n}</span>
              </Link>
            ))}
          </nav>
          <div className="min-w-0 flex-[999_1_560px]">
            {hits.length ? (
              <ProductGrid tiles={hits.map(tileFromDoc)} />
            ) : (
              <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-6">
                <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("emptyTitle")}</h2>
                <p className="m-0 text-ink-muted">{t("emptyBody")}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
