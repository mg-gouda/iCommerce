import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { CheckoutButton, money } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { products } from "@/lib/mock-products"

// ponytail: mock cart (B2C mock products, qty 1 / 2) until the Medusa cart lands in P2.
const lines = products.filter((p) => p.mode === "b2c").map((p, i) => ({ ...p, qty: i + 1 }))
const SHIPPING_PER_VENDOR = 4

export default function CartPage() {
  const t = useTranslations("cart")
  const locale = useLocale() as "en" | "ar"
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const shipping = new Set(lines.map((l) => l.vendor.en)).size * SHIPPING_PER_VENDOR
  const total = subtotal + shipping

  return (
    <>
      <header className="bg-navy text-on-navy">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" dir="ltr" className="text-[20px] leading-[26px] font-semibold text-on-navy no-underline">
            i<span className="text-brand">Commerce</span>
          </Link>
          <Link href="/" className="text-[14px] text-on-navy">
            {t("back")}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-6 px-4 py-8 md:px-8">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div>
            <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("title")}</h1>
            <p className="m-0 text-[13px] text-ink-muted">{t("sub")}</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
                <Image data-cart-thumb src={l.image} alt={l.imageAlt[locale]} width={80} height={64} className="h-16 w-20 flex-none rounded-md object-cover" />
                <div className="min-w-0 flex-[1_1_200px]">
                  <div className="font-medium">{l.title[locale]}</div>
                  <div className="text-[13px] text-ink-muted">{l.vendor[locale]}</div>
                </div>
                <div className="text-[13px] text-ink-muted">
                  {t("qty")}: <b className="text-ink tabular-nums">{l.qty}</b>
                </div>
                <bdi className="w-28 text-end font-semibold tabular-nums">{money(l.price * l.qty, "USD")}</bdi>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-lg border border-line bg-surface p-6">
          <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("summary")}</h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[14px] tabular-nums">
            <dt className="text-ink-muted">{t("subtotal")}</dt>
            <dd className="m-0"><bdi>{money(subtotal, "USD")}</bdi></dd>
            <dt className="text-ink-muted">{t("shipping")}</dt>
            <dd className="m-0"><bdi>{money(shipping, "USD")}</bdi></dd>
          </dl>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-semibold">{t("total")}</span>
            <bdi className="text-[24px] leading-[30px] font-semibold tabular-nums">{money(total, "USD")}</bdi>
          </div>
          <CheckoutButton label={`${t("checkout")} · ${money(total, "USD")}`} packingLabel={t("packing")} doneLabel={t("packed")} />
          <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{t("payNote")}</p>
        </aside>
      </main>
    </>
  )
}
