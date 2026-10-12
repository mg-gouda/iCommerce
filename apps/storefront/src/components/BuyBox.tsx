"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { AddToCartButton, Button, money } from "@icommerce/ui"
import { addToCart } from "@/lib/cart-actions"

type Props = { productId: string; price: number | null; unit: string | null; min: number | null; step: number | null; max: number | null; retail: boolean }

/** Quantity (MOQ / step / max aware) + subtotal + the one action this product allows. */
export function BuyBox({ productId, price, unit, min, step, max, retail }: Props) {
  const t = useTranslations("product")
  const id = useId()
  const lo = min ?? 1
  const [qty, setQty] = useState(lo)
  const u = unit ?? t("unitDefault")
  const valid = Number.isInteger(qty) && qty >= lo && (!max || qty <= max) && (!step || (qty - lo) % step === 0)
  const rules = [min && t("moqRule", { n: min, unit: u }), step && t("stepRule", { n: step }), max && t("maxRule", { n: max })].filter(Boolean).join(" · ")
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
              inputMode="numeric"
              dir="ltr"
              min={lo}
              step={step ?? 1}
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
            <bdi className="text-[24px] leading-[30px] font-semibold tabular-nums">{money(price * qty, "USD")}</bdi>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {retail ? (
          <AddToCartButton size="lg" className="flex-[1_1_200px]" qty={qty} disabled={!valid} onAdd={() => addToCart(productId, qty)} errorLabel={t("addFailed")} label={t("addQty", { n: valid ? qty : lo, unit: u })} doneLabel={t("added")} />
        ) : (
          <div className="flex flex-[1_1_200px] flex-col gap-1">
            {/* ponytail: RFQ flow lands in P3; button is a visible placeholder so B2B buyers see the path. */}
            <Button variant="primary" size="lg" aria-disabled="true" aria-describedby={`${id}-rfq`}>{t("requestQuote")}</Button>
            <span id={`${id}-rfq`} className="ic-help">{t("rfqSoon")}</span>
          </div>
        )}
      </div>
    </div>
  )
}
