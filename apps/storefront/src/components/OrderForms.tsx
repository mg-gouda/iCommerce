"use client"

import { Check, CircleAlert } from "lucide-react"
import { useActionState, useId } from "react"
import { useTranslations } from "next-intl"
import { Button, Field, Textarea } from "@icommerce/ui"
import { requestReturn, uploadProof } from "@/lib/account-actions"
import type { FormState } from "@/lib/forms"
import { FormMessage, useFieldError } from "./FormMessage"

function Done({ children }: { children: string }) {
  return (
    <p role="status" className="m-0 flex items-center gap-1.5 text-[14px] text-success">
      <Check size={16} aria-hidden /> {children}
    </p>
  )
}

export function ProofForm({ orderId }: { orderId: string }) {
  const t = useTranslations("order")
  const [state, run, pending] = useActionState(uploadProof, {} as FormState)
  const err = useFieldError(state)
  if (state.ok) return <Done>{t("proofSent")}</Done>
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="order" value={orderId} />
      <FormMessage state={state} />
      <Field label={t("proofLabel")} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" help={t("proofHelp")} error={err("file")} className="py-1.5" />
      <Button type="submit" busy={pending} className="self-start">{t("proofSubmit")}</Button>
    </form>
  )
}

export function ReturnForm({ orderId, items }: { orderId: string; items: { id: string; title: string; quantity: number }[] }) {
  const t = useTranslations("order")
  const [state, run, pending] = useActionState(requestReturn, {} as FormState)
  const err = useFieldError(state)
  const id = useId()
  if (state.ok) return <Done>{t("returnSent")}</Done>
  const itemsErr = err("items")
  return (
    <form action={run} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="order" value={orderId} />
      <FormMessage state={state} />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={itemsErr ? `${id}-items` : undefined}>
        <legend className="ic-label mb-1 p-0">{t("returnItems")}</legend>
        {items.map((i) => (
          <label key={i.id} className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
            <span dir="auto" className="min-w-0 flex-1 text-start">{i.title}</span>
            <span className="flex items-center gap-2">
              <span className="text-ink-muted">{t("returnQty")}</span>
              <input name={`qty_${i.id}`} type="number" inputMode="numeric" min={0} max={i.quantity} step={1} defaultValue={0} dir="ltr" className="ic-input ic-num w-20" />
            </span>
          </label>
        ))}
        {itemsErr && (
          <span id={`${id}-items`} className="ic-error">
            <CircleAlert aria-hidden /> {itemsErr}
          </span>
        )}
      </fieldset>
      <Textarea label={t("returnReason")} name="reason" required defaultValue={state.values?.reason} error={err("reason")} />
      <Button type="submit" busy={pending} className="self-start">{t("returnSubmit")}</Button>
    </form>
  )
}
