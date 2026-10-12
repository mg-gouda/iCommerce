"use client"

import { useActionState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, Field, Select } from "@icommerce/ui"
import { addFreeText } from "@/lib/p3/actions"
import type { FormState } from "@/lib/forms"
import { FormMessage, useFieldError } from "./FormMessage"

export const RFQ_UNITS = ["piece", "set", "carton", "pair", "m2", "m", "kg", "ton", "liter", "roll"] as const

/** Home "Post a request for quotation": free-text need → RFQ draft → review page (suppliers picked there). */
export function RfqQuickForm() {
  const t = useTranslations("b2b")
  const [state, run, pending] = useActionState(addFreeText, {} as FormState)
  const err = useFieldError(state)
  const v = state.values ?? {}
  return (
    <form action={run} noValidate className="rfq-navy flex flex-col gap-3.5">
      <input type="hidden" name="locale" value={useLocale()} />
      <FormMessage state={state} />
      <Field label={t("rfqWhat")} name="title" placeholder={t("rfqWhatPh")} required defaultValue={v.title} error={err("title")} />
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          <Field label={t("qty")} name="quantity" inputMode="decimal" dir="ltr" className="ic-num" required defaultValue={v.quantity ?? "500"} error={err("quantity")} />
        </div>
        <div className="min-w-0 flex-1">
          <Select label={t("unit")} name="unit" defaultValue={v.unit ?? "piece"}>
            {RFQ_UNITS.map((u) => <option key={u} value={u}>{t(`unitName.${u}`)}</option>)}
          </Select>
        </div>
      </div>
      <Button type="submit" variant="primary" block busy={pending} className="mt-1">{t("rfqPost")}</Button>
    </form>
  )
}
