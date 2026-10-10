import type { HTMLAttributes, ReactNode } from "react"
import { Badge } from "./Badge"
import { Button } from "./Button"
import { cx } from "./cx"
import { money } from "./money"

export type ProductCardProps = HTMLAttributes<HTMLElement> & {
  href: string
  image: string
  imageAlt: string
  vendor: string
  /** Accessible label for the KYC shield, e.g. "Verified supplier". Omit when unverified. */
  verified?: string
  title: string
  currency: string
  /** B2C: single price. B2B: pass `priceMax` for a tier range. */
  price: number
  priceMax?: number
  /** Struck original price; marks the card as on sale. */
  compareAt?: number
  unit?: string
  /** Max 2 badges on the image (sale %, B2B). */
  flags?: ReactNode
  facts?: ReactNode[]
  cta: string
  ctaPrimary?: boolean
  /** Replaces the default CTA button, e.g. <AddToCartButton />. */
  action?: ReactNode
}

export function ProductCard({
  href, image, imageAlt, vendor, verified, title, currency, price, priceMax, compareAt, unit,
  flags, facts, cta, ctaPrimary, action, className, ...props
}: ProductCardProps) {
  const sale = compareAt != null && compareAt > price
  return (
    <article className={cx("ic-card", className)} {...props}>
      <div className="ic-card__media">
        <img src={image} alt={imageAlt} loading="lazy" />
        {flags && <div className="ic-card__flags">{flags}</div>}
      </div>
      <div className="ic-card__body">
        <div className="ic-card__vendor">
          {verified && <Badge variant="verified" role="img" aria-label={verified} style={{ paddingInline: 4 }} />}
          <span>{vendor}</span>
        </div>
        <h3 className="ic-card__title">
          <a href={href} style={{ color: "inherit", textDecoration: "none" }}>
            {title}
          </a>
        </h3>
        <div className={cx("ic-card__price", sale && "ic-card__price--sale")}>
          <bdi>
            {money(price, currency)}
            {priceMax != null && `–${money(priceMax, currency).replace(/^\D+/, "")}`}
          </bdi>
          {sale && (
            <s>
              <bdi>{money(compareAt, currency)}</bdi>
            </s>
          )}
          {unit && <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-muted)" }}> / {unit}</span>}
        </div>
        {facts?.length ? (
          <ul className="ic-card__facts">
            {facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        ) : null}
        {action ?? (
          <Button variant={ctaPrimary ? "primary" : "secondary"} block className="ic-card__cta">
            {cta}
          </Button>
        )}
      </div>
    </article>
  )
}
