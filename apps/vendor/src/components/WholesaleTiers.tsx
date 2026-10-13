"use client"

import { useActionState, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button, Field } from "@icommerce/ui"
import { saveTiers } from "@/lib/quote-actions"
import type { FormState, WholesaleTier } from "@/lib/types"
import { FormMessage, useFieldError } from "./FormMessage"

const MAX = 10
let seq = 0
const row = (t?: WholesaleTier) => ({ key: ++seq, min: t ? String(t.min_qty) : "", price: t ? String(t.unit_price_usd) : "" })

/** Rows of min qty + unit price for verified company buyers. Ascending qty, price never rises. */
export function WholesaleTiers({ productId, tiers, unit }: { productId: string; tiers: WholesaleTier[]; unit: string }) {
  const t = useTranslations("tiers")
  const [state, action, pending] = useActionState(saveTiers.bind(null, productId), {} as FormState)
  const err = useFieldError(state)
  const [rows, setRows] = useState(() => (tiers.length ? tiers.map(row) : [row()]))
  const set = (key: number, patch: Partial<{ min: string; price: string }>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      {state.ok && <p role="status" className="m-0 rounded-md bg-success-tint p-3 text-[13px]">{t("saved")}</p>}
      <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t("rows")}>
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-3">
            <Field
              label={t("minQty", { n: i + 1 })}
              name="min_qty"
              inputMode="decimal"
              dir="ltr"
              unit={unit}
              value={r.min}
              onChange={(e) => set(r.key, { min: e.target.value })}
              error={err(`min_${i}`)}
            />
            <Field
              label={t("unitPrice", { n: i + 1 })}
              name="unit_price"
              inputMode="decimal"
              dir="ltr"
              unit="USD"
              value={r.price}
              onChange={(e) => set(r.key, { price: e.target.value })}
              error={err(`price_${i}`)}
            />
            <Button
              type="button"
              variant="ghost"
              className="mt-[26px]"
              aria-label={t("remove", { n: i + 1 })}
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [row()]))}
            >
              <Trash2 size={16} aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <p className="m-0 text-[13px] text-ink-muted">{t("help")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={rows.length >= MAX} onClick={() => setRows((rs) => [...rs, row()])}>
          <Plus size={16} aria-hidden /> {t("add")}
        </Button>
        <Button type="submit" variant="primary" busy={pending}>{t("save")}</Button>
      </div>
    </form>
  )
}
