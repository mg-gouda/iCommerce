"use client"

import { CircleAlert } from "lucide-react"
import { useId, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, money, PriceTiers, qtyUnit } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { addToRfq } from "@/lib/p3/actions"
import { tierPrice, tierRows } from "@/lib/p3/tiers"
import type { Tier } from "@/lib/p3/types"
import { CartAdd } from "./CartAdd"

// Quantities are decimals (≤3 places, e.g. 2.5 t) → compare in thousandths, never raw floats (0.1 + 0.2 drift).
const k = (n: number) => Math.round(n * 1000)

type Props = {
  productId: string
  price: number | null
  unit: string | null
  min: number | null
  step: number | null
  max: number | null
  retail: boolean
  /** Verified member in wholesale mode: tiers (maybe []) + Wholesale cart. */
  tiers: Tier[] | null
  /** Wholesale mode without a verified company → explain + quote only. */
  gate: "signIn" | "verify" | null
}

/** Wholesale tiers (live current row) + quantity (MOQ / step / max aware) + subtotal + the actions this buyer has. */
export function BuyBox({ productId, price, unit, min, step, max, retail, tiers, gate }: Props) {
  const t = useTranslations("product")
  const tb = useTranslations("b2b")
  const tu = useTranslations("units")
  const locale = useLocale()
  const id = useId()
  const lo = min ?? 1
  const [qty, setQty] = useState(lo)
  const [cartError, setCartError] = useState("")
  const u = unit ?? t("unitDefault")
  const qu = (n: number) => qtyUnit(tu, n, unit ?? "piece")
  const wholesale = tiers != null
  // ponytail: Medusa line-item quantity is an integer → fractional MOQ/step products are quote-only (no cart) until carts take decimals.
  const fractional = !Number.isInteger(lo) || (step != null && !Number.isInteger(step))
  const canCart = !fractional && !gate && (wholesale || retail)
  // Quotes take any positive quantity (≤3 decimals); the cart also needs MOQ / step / max.
  const quotable = Number.isFinite(qty) && qty > 0 && Math.abs(qty * 1000 - k(qty)) < 1e-6
  const valid =
    quotable &&
    (fractional || Number.isInteger(qty)) &&
    k(qty) >= k(lo) &&
    (!max || k(qty) <= k(max)) &&
    (!step || (k(qty) - k(lo)) % k(step) === 0)
  const unitPrice = wholesale ? tierPrice(tiers, qty, price) : price
  const subtotal = Math.round((Math.round((unitPrice ?? 0) * 100) * k(qty)) / 1000) / 100 // cents × thousandths
  const rules = [min && t("moqRule", { qty: qu(min) }), step && t("stepRule", { n: step }), max && t("maxRule", { n: max })].filter(Boolean).join(" · ")
  const showValid = canCart ? valid : quotable
  return (
    <div className="flex flex-col gap-4">
      {wholesale && tiers.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{tb("tiersTitle", { unit: u })}</h2>
          <PriceTiers tiers={tierRows(tiers)} currency="USD" qtyLabel={tb("tiersQty", { unit: u })} priceLabel={tb("tiersPrice", { unit: u })} quantity={valid ? qty : undefined} />
        </div>
      )}
      {gate && (
        <p className="m-0 flex flex-col gap-1 rounded-md border border-line bg-brand-tint p-3 text-[14px] text-brand-ink">
          <span className="font-semibold">{tb("gate")}</span>
          <Link href={gate === "signIn" ? "/login?next=/account/company" : "/account/company"} className="self-start text-brand-ink underline underline-offset-2">
            {gate === "signIn" ? tb("gateSignIn") : tb("gateVerify")}
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <div className="ic-field flex-[0_1_220px]">
          <label className="ic-label" htmlFor={id}>{t("quantity")}</label>
          <div className="ic-input-group">
            <input
              id={id}
              className="ic-input ic-num"
              type="number"
              inputMode={canCart && !fractional ? "numeric" : "decimal"}
              dir="ltr"
              min={canCart ? lo : 0.001}
              step={canCart ? (step ?? 1) : "any"}
              max={(canCart && max) || undefined}
              value={Number.isNaN(qty) ? "" : qty}
              onChange={(e) => (setQty(e.target.valueAsNumber), setCartError(""))}
              aria-invalid={!showValid || !!cartError || undefined}
              aria-describedby={`${id}-note`}
            />
            <span className="ic-addon">{u}</span>
          </div>
          <span id={`${id}-note`} className={showValid && !cartError ? "ic-help" : "ic-error"} aria-live="polite">
            {cartError ? (
              <><CircleAlert aria-hidden /> {cartError}</>
            ) : showValid ? (
              rules || t("anyQty")
            ) : canCart ? (
              t("qtyFix", { rules: rules || t("anyQty") })
            ) : (
              tb("qtyQuote")
            )}
          </span>
        </div>
        {unitPrice != null && showValid && !gate && (
          <div className="flex flex-[1_1_220px] flex-col gap-0.5 pb-[22px]" aria-live="polite">
            <span className="text-[13px] text-ink-muted">{t("subtotalAt", { price: money(unitPrice, "USD"), unit: u })}</span>
            <bdi className="text-[24px] leading-[30px] font-semibold tabular-nums">{money(subtotal, "USD")}</bdi>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {canCart && (
          <CartAdd
            size="lg"
            className="flex-[1_1_200px]"
            productId={productId}
            qty={qty}
            disabled={!valid}
            onRefused={(m) => setCartError(m === "not_retail" ? t("addFailed") : m)}
            errorLabel={t("addFailed")}
            label={t("addQty", { qty: qu(valid ? qty : lo) })}
            doneLabel={t("added")}
          />
        )}
        {(!canCart || wholesale) && (
          <form action={addToRfq} className="flex flex-[1_1_200px] flex-col gap-1">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="quantity" value={quotable ? qty : lo} />
            <Button type="submit" variant={canCart ? "secondary" : "primary"} size="lg" disabled={!quotable} aria-describedby={`${id}-rfq`}>
              {t("requestQuote")}
            </Button>
            <span id={`${id}-rfq`} className="ic-help">{fractional ? `${t("decimalQuote")} ${tb("quoteHelp")}` : tb("quoteHelp")}</span>
          </form>
        )}
      </div>
    </div>
  )
}
