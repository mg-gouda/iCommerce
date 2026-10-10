import { money } from "./money"

export type Tier = { min: number; max?: number; price: number }

export type PriceTiersProps = {
  tiers: Tier[]
  currency: string
  /** Column heads name the unit, e.g. "Quantity (sets)", "Price / set". */
  qtyLabel: string
  priceLabel: string
  /** Buyer's quantity; the matching row gets aria-current. */
  quantity?: number
}

const n = (v: number) => v.toLocaleString("en-US")

export function PriceTiers({ tiers, currency, qtyLabel, priceLabel, quantity }: PriceTiersProps) {
  return (
    <table className="ic-tiers">
      <thead>
        <tr>
          <th scope="col">{qtyLabel}</th>
          <th scope="col">{priceLabel}</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((t) => {
          const current = quantity != null && quantity >= t.min && (t.max == null || quantity <= t.max)
          return (
            <tr key={t.min} aria-current={current || undefined}>
              <td>
                <bdi>{t.max == null ? `${n(t.min)}+` : `${n(t.min)}–${n(t.max)}`}</bdi>
              </td>
              <td>
                <bdi>{money(t.price, currency)}</bdi>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
