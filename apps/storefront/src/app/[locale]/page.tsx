import { Search } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { AddToCartButton, Badge, CartLink, ProductCard } from "@icommerce/ui"
import { LocaleSwitch } from "@/components/LocaleSwitch"
import { Link } from "@/i18n/navigation"
import { products } from "@/lib/mock-products"

export default function Home() {
  const t = useTranslations("home")
  const locale = useLocale() as "en" | "ar"

  return (
    <>
      <header className="bg-navy text-on-navy">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
          <Link href="/" dir="ltr" className="text-[20px] leading-[26px] font-semibold tracking-[-0.01em] text-on-navy no-underline">
            i<span className="text-brand">Commerce</span>
          </Link>
          <form role="search" action="" className="order-last flex min-w-0 basis-full md:order-none md:flex-1 md:basis-auto">
            <label htmlFor="q" className="sr-only">
              {t("searchLabel")}
            </label>
            <input id="q" name="q" type="search" className="ic-input rounded-e-none" placeholder={t("searchPlaceholder")} />
            <button type="submit" className="ic-btn ic-btn--primary h-[38px] rounded-s-none" aria-label={t("searchLabel")}>
              <Search size={18} aria-hidden />
            </button>
          </form>
          <div className="ms-auto flex items-center gap-4 md:ms-0">
            <Link href="/login" className="text-[14px] font-medium text-on-navy no-underline hover:underline">
              {t("signIn")}
            </Link>
            <LocaleSwitch />
            <CartLink href={`/${locale}/cart`} label={t.raw("cartLabel")} initialCount={2} className="text-on-navy" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-8 md:px-8">
        <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("featured")}</h1>
        <p className="mt-1 mb-6 text-[13px] leading-[18px] text-ink-muted">{t("featuredSub")}</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] md:gap-6">
          {products.map((p) => {
            const b2b = p.mode === "b2b"
            const off = p.compareAt ? Math.round((1 - p.price / p.compareAt) * 100) : 0
            return (
              <ProductCard
                key={p.id}
                href={`/${locale}/products/${p.id}`}
                image={p.image}
                imageAlt={p.imageAlt[locale]}
                vendor={p.vendor[locale]}
                verified={p.verified ? t("verified") : undefined}
                title={p.title[locale]}
                currency="USD"
                price={p.price}
                priceMax={p.priceMax}
                compareAt={p.compareAt}
                unit={p.unit?.[locale]}
                flags={
                  b2b ? <Badge variant="b2b">B2B</Badge> : off ? <Badge variant="sale"><bdi>−{off}%</bdi></Badge> : undefined
                }
                facts={
                  b2b
                    ? [
                        <span key="moq">{t("moq")} <b>{p.moq?.[locale]}</b></span>,
                        <span key="lead">{t("lead")} <b>{p.lead?.[locale]}</b></span>,
                      ]
                    : [p.ships?.[locale]]
                }
                cta={b2b ? t("requestQuote") : t("addToCart")}
                ctaPrimary={!b2b}
                action={b2b ? undefined : <AddToCartButton block className="ic-card__cta" label={t("addToCart")} doneLabel={t("added")} />}
              />
            )
          })}
        </div>
      </main>
    </>
  )
}
