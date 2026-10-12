import Image from "next/image"
import { ShieldCheck, ShoppingCart } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { money } from "@icommerce/ui"
import { CheckoutCta } from "@/components/CheckoutCta"
import { CheckoutHeader } from "@/components/Header"
import { Link } from "@/i18n/navigation"
import { setLineQty } from "@/lib/cart-actions"
import { shippingGroups } from "@/lib/checkout"
import { countOf, getCart, token } from "@/lib/session"
import { byVendor, isVerified, productsById } from "@/lib/store"

const PLACEHOLDER = "/samples/placeholder.svg"

export default async function CartPage() {
  const t = await getTranslations("cart")
  const cart = await getCart()
  const items = cart?.items ?? []

  if (!items.length) {
    const signedIn = !!(await token())
    return (
      <>
        <CheckoutHeader />
        <main className="mx-auto flex max-w-[640px] flex-col items-start gap-4 px-4 py-16 md:px-8">
          <ShoppingCart size={40} aria-hidden className="text-ink-muted rtl:-scale-x-100" />
          <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("emptyTitle")}</h1>
          <p className="m-0 max-w-[56ch] text-ink-muted">{t("emptyBody")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/search" className="ic-btn ic-btn--primary no-underline">{t("browse")}</Link>
            {!signedIn && (
              <span className="text-[14px] text-ink-muted">
                {t("emptySignIn")} <Link href="/login?next=/cart" className="text-brand-ink underline underline-offset-2">{t("signIn")}</Link>
              </span>
            )}
          </div>
        </main>
      </>
    )
  }

  const [products, groups] = await Promise.all([productsById(items.map((i) => i.product_id)), shippingGroups(cart!.id)])
  const vendors = byVendor(items, products)
  const count = countOf(cart)
  const currency = cart!.currency_code.toUpperCase()
  const subtotal = cart!.item_subtotal ?? 0
  // Cheapest option per vendor as a hint; the exact method is picked at checkout.
  const fromPrice = (handle: string | undefined) => groups.find((g) => g.vendor?.handle === handle)?.options[0]?.amount
  const shipFrom = groups.reduce((s, g) => s + (g.options[0]?.amount ?? 0), 0)

  return (
    <>
      <CheckoutHeader />
      <main className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-6 px-4 pt-8 pb-12 md:px-8">
        <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("title")}</h1>
            <span className="text-[14px] text-ink-muted">{t("countLine", { items: count, vendors: vendors.length })}</span>
          </div>

          {vendors.map(({ vendor, items: lines }) => {
            const from = fromPrice(vendor?.handle)
            return (
              <section key={vendor?.handle ?? ""} aria-label={vendor?.name ?? t("supplier")} className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ground px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {isVerified(vendor) && <ShieldCheck size={16} className="text-brand-ink" role="img" aria-label={t("verified")} />}
                    {vendor ? <Link href={`/v/${vendor.handle}`} className="text-ink no-underline hover:underline">{vendor.name}</Link> : t("supplier")}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {from != null ? t("shipFrom", { price: money(from, currency) }) : t("shipsSeparately")}
                  </span>
                </div>
                <ul className="m-0 list-none p-0">
                  {lines.map((l) => {
                    const e = products.get(l.product_id ?? "")?.product_extra ?? null
                    const lo = e?.min_qty ?? 1
                    const step = e?.qty_step ?? 1
                    const unit = e?.unit ?? t("unitDefault")
                    const down = l.quantity - step
                    const up = l.quantity + step
                    const noteId = `note-${l.id}`
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-4 border-b border-line p-4 last:border-b-0">
                        <Image data-cart-thumb src={l.thumbnail ?? PLACEHOLDER} alt="" width={80} height={64} className="h-16 w-20 flex-none rounded-md object-cover" />
                        <div className="min-w-0 flex-[1_1_220px]">
                          <Link href={`/p/${l.product_handle}`} dir="auto" className="block text-start font-medium text-ink no-underline hover:underline">{l.product_title}</Link>
                          <div id={noteId} className="text-[13px] text-ink-muted">
                            <bdi>{money(l.unit_price, currency)}</bdi> / {unit}
                            {(lo > 1 || step > 1) && <> · {t("rules", { min: lo, step })}</>}
                          </div>
                        </div>
                        <form action={setLineQty} className="flex items-center gap-1.5" role="group" aria-label={t("qtyFor", { title: l.product_title ?? "" })}>
                          <input type="hidden" name="line" value={l.id} />
                          <button name="qty" value={down} disabled={down < lo} aria-label={t("decrease")} aria-describedby={noteId} className="ic-btn ic-btn--sm size-8 p-0">−</button>
                          <output aria-live="polite" className="min-w-8 text-center font-semibold tabular-nums">{l.quantity}</output>
                          <button name="qty" value={up} disabled={!!e?.max_qty && up > e.max_qty} aria-label={t("increase")} aria-describedby={noteId} className="ic-btn ic-btn--sm size-8 p-0">+</button>
                        </form>
                        <bdi className="w-28 text-end font-semibold tabular-nums">{money(l.unit_price * l.quantity, currency)}</bdi>
                        <form action={setLineQty}>
                          <input type="hidden" name="line" value={l.id} />
                          <button name="qty" value="0" className="ic-btn ic-btn--ghost ic-btn--sm" aria-label={t("removeItem", { title: l.product_title ?? "" })}>{t("remove")}</button>
                        </form>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </section>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-lg border border-line bg-surface p-6 lg:sticky lg:top-6">
          <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("summary")}</h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-[14px] tabular-nums">
            <dt className="text-ink-muted">{t("subtotalN", { n: count })}</dt>
            <dd className="m-0"><bdi>{money(subtotal, currency)}</bdi></dd>
            <dt className="text-ink-muted">{t("shippingN", { n: vendors.length })}</dt>
            <dd className="m-0">{groups.length ? <bdi>{t("from", { price: money(shipFrom, currency) })}</bdi> : t("atCheckout")}</dd>
          </dl>
          <div className="flex items-baseline justify-between border-t border-line pt-3.5">
            <span className="font-semibold">{t("estTotal")}</span>
            <bdi className="text-[24px] leading-[30px] font-semibold tabular-nums">{money(subtotal + shipFrom, currency)}</bdi>
          </div>
          <CheckoutCta label={t("checkout")} packingLabel={t("packing")} doneLabel={t("packed")} />
          <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{t("payNote")}</p>
          <Link href="/" className="self-center text-[14px] text-brand-ink underline underline-offset-2">{t("back")}</Link>
        </aside>
      </main>
    </>
  )
}
