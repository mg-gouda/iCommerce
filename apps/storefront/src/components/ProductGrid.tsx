import { getLocale, getTranslations } from "next-intl/server"
import { Badge, ProductCard, qtyUnit } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { buyingMode } from "@/lib/p3/mode"
import { wholesaleRanges } from "@/lib/p3/pricing"
import type { SearchDoc } from "@/lib/search"
import { compareAtOf, isFractional, isRetail, isVerified, priceOf, type Product } from "@/lib/store"
import { CartAdd } from "./CartAdd"

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

/** Product tiles. Wholesale mode: verified members see tier ranges; others a sign-in note and quote links. */
export async function ProductGrid({ tiles }: { tiles: Tile[] }) {
  const [t, tu, locale, { mode, wholesale }] = await Promise.all([getTranslations("product"), getTranslations("units"), getLocale(), buyingMode()])
  const ranges = wholesale ? await wholesaleRanges(tiles.map((p) => p.id)) : new Map<string, { min: number; max: number }>()
  const b2bMode = mode === "wholesale"
  return (
    <>
      {b2bMode && !wholesale && <WholesaleGate />}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-0 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-6">
        {tiles.map((p) => {
          const href = `/${locale}/p/${p.handle}`
          const range = ranges.get(p.id)
          const off = !b2bMode && p.compareAt && p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0
          const link = (label: string) => (
            <a href={href} className="ic-btn ic-btn--block ic-card__cta no-underline" aria-label={`${label}: ${p.title}`}>{label}</a>
          )
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
                price={range?.min ?? p.price ?? 0}
                priceMax={range ? (range.max !== range.min ? range.max : undefined) : p.priceMax}
                compareAt={b2bMode ? undefined : p.compareAt}
                unit={p.unit ?? undefined}
                flags={!p.retail || b2bMode ? <Badge variant="b2b">B2B</Badge> : off > 0 ? <Badge variant="sale"><bdi>−{off}%</bdi></Badge> : undefined}
                facts={p.moq ? [<span key="moq">{t("moq")} <b><bdi>{p.unit ? qtyUnit(tu, p.moq, p.unit) : p.moq}</bdi></b></span>] : undefined}
                cta={t("requestQuote")}
                action={
                  wholesale ? link(t("chooseQty"))
                  : b2bMode || !p.retail ? link(t("requestQuote"))
                  : p.quick ? <CartAdd block className="ic-card__cta" productId={p.id} label={t("addToCart")} doneLabel={t("added")} errorLabel={t("addFailed")} />
                  : link(t("chooseQty"))
                }
              />
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Wholesale mode without a verified company: say why prices are retail and how to unlock wholesale. */
export async function WholesaleGate() {
  const [t, { membership }] = await Promise.all([getTranslations("b2b"), buyingMode()])
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-brand-tint px-4 py-3 text-[14px] text-brand-ink">
      <span className="font-semibold">{t("gate")}</span>
      <Link href={membership ? "/account/company" : "/login?next=/account/company"} className="text-brand-ink underline underline-offset-2">
        {membership ? t("gateVerify") : t("gateSignIn")}
      </Link>
    </p>
  )
}
