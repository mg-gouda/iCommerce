"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Button, Field } from "@icommerce/ui"
import { createShippingOption, deleteShippingOption } from "@/lib/order-actions"
import type { FormState, ShippingOption } from "@/lib/types"
import { Select } from "./controls"
import { FormMessage, useFieldError } from "./FormMessage"
import { panel } from "./PageHeader"
import { Saved } from "./StoreForms"

const KINDS = ["flat", "free_over", "pickup"] as const

export function NewShippingOption() {
  const t = useTranslations("shipping")
  const [state, action, pending] = useActionState(createShippingOption, {} as FormState)
  const err = useFieldError(state)
  const [kind, setKind] = useState<string>(state.values?.kind ?? "flat")
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.ok) form.current?.reset()
  }, [state])
  const v = state.values ?? {}
  return (
    <form ref={form} action={action} noValidate className={`${panel} grid max-w-[880px] gap-4 md:grid-cols-2`}>
      <FormMessage state={state} className="md:col-span-2" />
      <Field label={t("name")} name="name" required placeholder={t("namePlaceholder")} defaultValue={v.name} error={err("name")} />
      <Select label={t("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} help={t(`kindHelp.${kind}`)}>
        {KINDS.map((k) => (
          <option key={k} value={k}>{t(`kinds.${k}`)}</option>
        ))}
      </Select>
      {kind !== "pickup" && (
        <Field label={t("amount")} name="amount" type="number" inputMode="decimal" min={0} step="0.01" dir="ltr" required defaultValue={v.amount} error={err("amount")} />
      )}
      {kind === "free_over" && (
        <Field label={t("freeOver")} name="free_over" type="number" inputMode="decimal" min={0} step="0.01" dir="ltr" required help={t("freeOverHelp")} defaultValue={v.free_over} error={err("free_over")} />
      )}
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" variant="primary" busy={pending}>{t("add")}</Button>
        <Saved show={state.ok && !pending} label={t("added")} />
      </div>
    </form>
  )
}

export function DeleteShippingOption({ option }: { option: ShippingOption }) {
  const t = useTranslations("shipping")
  const [confirming, setConfirming] = useState<boolean | null>(null)
  if (!confirming)
    return (
      <Button autoFocus={confirming === false} size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={t("deleteLabel", { name: option.name })}>
        {t("delete")}
      </Button>
    )
  return (
    <form action={deleteShippingOption} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={option.id} />
      <span className="text-[13px] text-danger">{t("confirmDelete")}</span>
      <Button type="submit" size="sm" variant="danger" autoFocus>{t("delete")}</Button>
      <Button type="button" size="sm" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
    </form>
  )
}
