import { getLocale, getTranslations } from "next-intl/server"
import { Badge } from "@icommerce/ui"
import { Header } from "@/components/Header"
import { RfqQuickForm } from "@/components/RfqForms"
import { ProductGrid, tileFromProduct } from "@/components/ProductGrid"
import { Link } from "@/i18n/navigation"
import { listCategories, listProducts } from "@/lib/store"

const VENDOR_PORTAL = process.env.NEXT_PUBLIC_VENDOR_PORTAL_URL ?? "http://localhost:3001"

export default async function Home() {
  const [t, tb] = await Promise.all([getTranslations("home"), getTranslations("b2b")])
  const locale = await getLocale()
  const [{ products, count }, categories] = await Promise.all([listProducts({ limit: 12 }), listCategories()])

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-12 px-4 py-8 md:px-8">
        <div className="flex flex-wrap items-stretch gap-6">
          <section className="flex min-w-0 flex-[999_1_560px] flex-col justify-center gap-5 rounded-lg border border-line bg-surface p-6 md:p-10">
            <h1 className="m-0 max-w-[20ch] text-[30px] leading-[36px] font-semibold tracking-[-0.01em] text-balance md:text-[36px] md:leading-[42px] rtl:leading-[48px]">
              {t("heroTitle")}
            </h1>
            <p className="m-0 max-w-[56ch] text-[16px] leading-[24px] text-ink-muted">{t("heroBody")}</p>
            <div className="flex flex-wrap gap-3">
              <a href="#featured" className="ic-btn ic-btn--primary ic-btn--lg no-underline">{t("shop")}</a>
              <Link href="/search" className="ic-btn ic-btn--lg no-underline">{t("browse")}</Link>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[13px] text-ink-muted">
              <li>{t.rich("statProducts", { n: count, b: (c) => <b className="text-ink tabular-nums">{c}</b> })}</li>
              <li>{t.rich("statCategories", { n: categories.length, b: (c) => <b className="text-ink tabular-nums">{c}</b> })}</li>
              <li>{t("ships")}</li>
            </ul>
          </section>
          <section aria-labelledby="rfq-title" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-lg bg-navy p-6 text-on-navy md:p-7">
            <Badge variant="verified" className="self-start">{tb("forCompanies")}</Badge>
            <h2 id="rfq-title" className="m-0 text-[20px] leading-[26px] font-semibold">{tb("rfqTitle")}</h2>
            <p className="m-0 text-[13px] leading-[18px] text-on-navy-muted">{tb("rfqSub")}</p>
            <RfqQuickForm />
          </section>
        </div>

        {categories.length > 0 && (
          <section aria-labelledby="cats" className="flex flex-col gap-4">
            <h2 id="cats" className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("categories")}</h2>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-0">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/c/${c.handle}`}
                    className="flex rounded-md border border-line bg-surface px-4 py-3.5 font-semibold text-ink no-underline transition-colors duration-150 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="featured" aria-labelledby="featured-title" className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="featured-title" className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("featured")}</h2>
            <span className="text-[13px] text-ink-muted">{t("featuredSub")}</span>
          </div>
          {products.length ? <ProductGrid tiles={products.map(tileFromProduct)} /> : <p className="m-0 text-ink-muted">{t("empty")}</p>}
        </section>

        <aside className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface p-6">
          <div className="flex max-w-[60ch] flex-col gap-1">
            <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("sellTitle")}</h2>
            <p className="m-0 text-[14px] text-ink-muted">{t("sellBody")}</p>
          </div>
          <a href={`${VENDOR_PORTAL}/${locale}/signup`} className="ic-btn no-underline">{t("sellCta")}</a>
        </aside>
      </main>
    </>
  )
}
