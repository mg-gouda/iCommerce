"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { AddToCartButton, Button, money, qtyUnit } from "@icommerce/ui"

// Quantities are decimals (≤3 places, e.g. 2.5 t) → compare in thousandths, never raw floats (0.1 + 0.2 drift).
const k = (n: number) => Math.round(n * 1000)

type Props = { price: number | null; unit: string | null; min: number | null; step: number | null; max: number | null; retail: boolean }

/** Quantity (MOQ / step / max aware) + subtotal + the one action this product allows. */
export function BuyBox({ price, unit, min, step, max, retail }: Props) {
  const t = useTranslations("product")
  const tu = useTranslations("units")
  const id = useId()
  const lo = min ?? 1
  const [qty, setQty] = useState(lo)
  const u = unit ?? t("unitDefault")
  const qu = (n: number) => qtyUnit(tu, n, unit ?? "piece")
  // ponytail: Medusa line-item quantity is an integer → fractional MOQ/step products are quote-only (no cart) until carts take decimals.
  const fractional = !Number.isInteger(lo) || (step != null && !Number.isInteger(step))
  const valid =
    Number.isFinite(qty) &&
    Math.abs(qty * 1000 - k(qty)) < 1e-6 &&
    (fractional || Number.isInteger(qty)) &&
    k(qty) >= k(lo) &&
    (!max || k(qty) <= k(max)) &&
    (!step || (k(qty) - k(lo)) % k(step) === 0)
  const subtotal = Math.round((Math.round((price ?? 0) * 100) * k(qty)) / 1000) / 100 // cents × thousandths
  const rules = [min && t("moqRule", { qty: qu(min) }), step && t("stepRule", { n: step }), max && t("maxRule", { n: max })].filter(Boolean).join(" · ")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="ic-field flex-[0_1_220px]">
          <label className="ic-label" htmlFor={id}>{t("quantity")}</label>
          <div className="ic-input-group">
            <input
              id={id}
              className="ic-input ic-num"
              type="number"
              inputMode={fractional ? "decimal" : "numeric"}
              dir="ltr"
              min={lo}
              step={step ?? (fractional ? 0.001 : 1)}
              max={max ?? undefined}
              value={Number.isNaN(qty) ? "" : qty}
              onChange={(e) => setQty(e.target.valueAsNumber)}
              aria-invalid={!valid || undefined}
              aria-describedby={`${id}-note`}
            />
            <span className="ic-addon">{u}</span>
          </div>
          <span id={`${id}-note`} className={valid ? "ic-help" : "ic-error"}>
            {valid ? rules || t("anyQty") : t("qtyFix", { rules: rules || t("anyQty") })}
          </span>
        </div>
        {price != null && valid && (
          <div className="flex flex-[1_1_220px] flex-col gap-0.5 pb-[22px]" aria-live="polite">
            <span className="text-[13px] text-ink-muted">{t("subtotalAt", { price: money(price, "USD"), unit: u })}</span>
            <bdi className="text-[24px] leading-[30px] font-semibold tabular-nums">{money(subtotal, "USD")}</bdi>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {retail && !fractional ? (
          <AddToCartButton size="lg" className="flex-[1_1_200px]" qty={valid ? qty : lo} disabled={!valid} label={t("addQty", { qty: qu(valid ? qty : lo) })} doneLabel={t("added")} />
        ) : (
          <div className="flex flex-[1_1_200px] flex-col gap-1">
            {/* ponytail: RFQ flow lands in P3; button is a visible placeholder so B2B buyers see the path. */}
            <Button variant="primary" size="lg" aria-disabled="true" aria-describedby={`${id}-rfq`}>{t("requestQuote")}</Button>
            <span id={`${id}-rfq`} className="ic-help">{fractional ? `${t("decimalQuote")} ${t("rfqSoon")}` : t("rfqSoon")}</span>
          </div>
        )}
      </div>
    </div>
  )
}
