"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button, Field, ShipButton } from "@icommerce/ui"
import { cancelOrder, decideReturn, deliverOrder, fulfillOrder } from "@/lib/order-actions"
import type { FormState } from "@/lib/types"
import { Textarea } from "./controls"
import { FormMessage, useFieldError } from "./FormMessage"

/** Carrier + tracking; ShipButton is the submit. Truck drives only after the API accepted the shipment. */
export function FulfilForm({ id, disabled }: { id: string; disabled?: boolean }) {
  const t = useTranslations("orders")
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [state, setState] = useState<FormState>({})
  const err = useFieldError(state)
  const v = state.values ?? {}
  return (
    // Enter in a field "clicks" the ShipButton (implicit submission) → same path as a click.
    <form ref={form} noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("carrier")} name="carrier" required autoComplete="off" placeholder={t("carrierPlaceholder")} defaultValue={v.carrier} error={err("carrier")} disabled={disabled} />
        <Field label={t("trackingNumber")} name="tracking_number" required mono dir="ltr" autoComplete="off" defaultValue={v.tracking_number} error={err("tracking_number")} disabled={disabled} />
      </div>
      <Field label={t("trackingUrl")} name="tracking_url" type="url" dir="ltr" placeholder="https://" help={t("trackingUrlHelp")} defaultValue={v.tracking_url} error={err("tracking_url")} disabled={disabled} />
      <div>
        <ShipButton
          label={t("ship")}
          busyLabel={t("shipping")}
          doneLabel={t("shipped")}
          disabled={disabled}
          onShip={async () => {
            setState({})
            const res = await fulfillOrder(id, new FormData(form.current!))
            setState(res)
            return !!res.ok
          }}
          onDone={() => router.refresh()}
        />
      </div>
    </form>
  )
}

/** Inline two-step confirm (no modal), same pattern as product delete. */
function Confirm({ label, question, confirm, onConfirm }: { label: string; question: string; confirm: string; onConfirm: () => Promise<FormState> }) {
  const t = useTranslations("orders")
  const [open, setOpen] = useState<boolean | null>(null)
  const [state, setState] = useState<FormState>({})
  const [pending, start] = useTransition()
  if (!open)
    return (
      <Button autoFocus={open === false} variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  return (
    <div className="flex flex-col gap-2">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{question}</span>
        <Button autoFocus variant="primary" busy={pending} disabled={pending} onClick={() => start(async () => setState(await onConfirm()))}>
          {confirm}
        </Button>
        <Button onClick={() => setOpen(false)} disabled={pending}>{t("keep")}</Button>
      </div>
    </div>
  )
}

export function DeliverButton({ id }: { id: string }) {
  const t = useTranslations("orders")
  return <Confirm label={t("deliver")} question={t("deliverQuestion")} confirm={t("deliverConfirm")} onConfirm={() => deliverOrder(id)} />
}

export function CancelForm({ id }: { id: string }) {
  const t = useTranslations("orders")
  const [open, setOpen] = useState<boolean | null>(null)
  const [state, action, pending] = useActionState(cancelOrder.bind(null, id), {} as FormState)
  const err = useFieldError(state)
  if (!open)
    return (
      <Button autoFocus={open === false} variant="ghost" onClick={() => setOpen(true)}>
        {t("cancelOrder")}
      </Button>
    )
  return (
    <form action={action} noValidate className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Textarea label={t("cancelReason")} name="reason" required autoFocus defaultValue={state.values?.reason} help={t("cancelReasonHelp")} error={err("reason")} className="min-h-20" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" busy={pending}>{t("cancelConfirm")}</Button>
        <Button type="button" onClick={() => setOpen(false)}>{t("keep")}</Button>
      </div>
    </form>
  )
}

export function ReturnDecision({ id }: { id: string }) {
  const t = useTranslations("orders")
  const [state, action, pending] = useActionState(decideReturn.bind(null, id), {} as FormState)
  return (
    <form action={action} noValidate className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Textarea label={t("returnNote")} name="note" help={t("returnNoteHelp")} className="min-h-20" defaultValue={state.values?.note} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="action" value="approve" variant="primary" busy={pending}>{t("approveReturn")}</Button>
        <Button type="submit" name="action" value="reject" disabled={pending}>{t("rejectReturn")}</Button>
      </div>
    </form>
  )
}
