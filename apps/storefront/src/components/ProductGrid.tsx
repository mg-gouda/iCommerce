import { useLocale, useTranslations } from "next-intl"
import { AddToCartButton, Badge, ProductCard, qtyUnit } from "@icommerce/ui"
import type { SearchDoc } from "@/lib/search"
import { addToCart } from "@/lib/cart-actions"
import { compareAtOf, isFractional, isRetail, isVerified, priceOf, type Product } from "@/lib/store"

export type Tile = {
  id: string
  handle: string
  title: string
  image: string | null
  vendor: string
  verified?: boolean
  price: number | null
  priceMax?: number
  compareAt?: number
  unit: string | null
  moq: number | null
  retail: boolean
  /** One-click add of 1 unit is valid (MOQ ≤ 1, integer step). Unknown (search docs) → false → product page picks the qty. */
  quick: boolean
}

export const tileFromProduct = (p: Product): Tile => ({
  id: p.id,
  handle: p.handle,
  title: p.title,
  image: p.thumbnail ?? p.images[0]?.url ?? null,
  vendor: p.vendor?.name ?? "",
  verified: isVerified(p.vendor),
  price: priceOf(p),
  compareAt: compareAtOf(p),
  unit: p.product_extra?.unit ?? null,
  moq: p.product_extra?.min_qty ?? null,
  retail: isRetail(p.product_extra),
  quick: !isFractional(p.product_extra) && (p.product_extra?.min_qty ?? 1) <= 1,
})

// Search docs carry no vendor KYC state → no verified shield on search tiles.
export const tileFromDoc = (d: SearchDoc): Tile => ({
  id: d.id,
  handle: d.handle,
  title: d.title,
  image: d.thumbnail,
  vendor: d.vendor_name ?? "",
  price: d.price_min,
  priceMax: d.price_max != null && d.price_max !== d.price_min ? d.price_max : undefined,
  unit: d.unit,
  moq: null,
  retail: !d.b2b_only && d.b2c_enabled,
  // ponytail: search docs lack min_qty/qty_step → no one-click add from search until the index carries them.
  quick: false,
})

const PLACEHOLDER = "/samples/placeholder.svg"

export function ProductGrid({ tiles }: { tiles: Tile[] }) {
  const t = useTranslations("product")
  const tu = useTranslations("units")
  const locale = useLocale()
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-0 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-6">
      {tiles.map((p) => {
        const href = `/${locale}/p/${p.handle}`
        const off = p.compareAt && p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0
        return (
          <li key={p.id} className="flex">
            <ProductCard
              className="w-full"
              href={href}
              image={p.image ?? PLACEHOLDER}
              imageAlt={p.title}
              vendor={p.vendor}
              verified={p.verified ? t("verified") : undefined}
              title={p.title}
              currency="USD"
              price={p.price ?? 0}
              priceMax={p.priceMax}
              compareAt={p.compareAt}
              unit={p.unit ?? undefined}
              flags={!p.retail ? <Badge variant="b2b">B2B</Badge> : off > 0 ? <Badge variant="sale"><bdi>−{off}%</bdi></Badge> : undefined}
              facts={p.moq ? [<span key="moq">{t("moq")} <b><bdi>{p.unit ? qtyUnit(tu, p.moq, p.unit) : p.moq}</bdi></b></span>] : undefined}
              cta={t("requestQuote")}
              action={
                p.retail && p.quick ? (
                  <AddToCartButton block className="ic-card__cta" onAdd={addToCart.bind(null, p.id, 1)} label={t("addToCart")} doneLabel={t("added")} errorLabel={t("addFailed")} />
                ) : p.retail ? (
                  <a href={href} className="ic-btn ic-btn--block ic-card__cta no-underline" aria-label={`${t("chooseQty")}: ${p.title}`}>
                    {t("chooseQty")}
                  </a>
                ) : (
                  <a href={href} className="ic-btn ic-btn--block ic-card__cta no-underline" aria-label={`${t("requestQuote")}: ${p.title}`}>
                    {t("requestQuote")}
                  </a>
                )
              }
            />
          </li>
        )
      })}
    </ul>
  )
}
