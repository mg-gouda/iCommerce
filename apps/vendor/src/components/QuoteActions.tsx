"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
import { Button, Field, money } from "@icommerce/ui"
import { rejectQuote, sendOffer, sendQuoteMessage } from "@/lib/quote-actions"
import type { FormState, Quote } from "@/lib/types"
import { Select, Textarea } from "./controls"
import { FormMessage, useFieldError } from "./FormMessage"

const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DDP"]
const fmtQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 })

/** One row per item: unit price (required) + lead time; live total; validity, incoterm, note. */
export function OfferForm({ quote }: { quote: Quote }) {
  const t = useTranslations("quotes")
  const ids = quote.items.map((i) => i.id)
  const [state, action, pending] = useActionState(sendOffer.bind(null, quote.id, ids), {} as FormState)
  const err = useFieldError(state)
  const v = state.values ?? {}
  const initial = (i: Quote["items"][number]) => v[`price_${i.id}`] ?? (i.offered_unit_price != null ? String(i.offered_unit_price) : "")
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(quote.items.map((i) => [i.id, initial(i)])))
  const total = quote.items.reduce((s, i) => s + i.quantity * (Number(prices[i.id]) || 0), 0)
  const cur = quote.currency_code.toUpperCase()
  const [tomorrow] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      {state.ok && <p role="status" className="m-0 rounded-md bg-success-tint p-3 text-[13px]">{t("offerSent")}</p>}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {quote.items.map((i) => (
          <li key={i.id} className="grid gap-3 border-b border-line pb-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_160px_120px] sm:items-start">
            <div className="min-w-0 text-[14px]">
              <p className="m-0 font-medium">{i.title}</p>
              <p className="m-0 text-[13px] text-ink-muted">
                <bdi>{fmtQty(i.quantity)} {i.unit ?? ""}</bdi>
                {i.target_price != null && <> · {t("target")} <bdi>{money(i.target_price, cur)}</bdi></>}
              </p>
            </div>
            <Field
              label={t("unitPrice")}
              name={`price_${i.id}`}
              inputMode="decimal"
              dir="ltr"
              unit={cur}
              required
              value={prices[i.id]}
              onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
              error={err(`price_${i.id}`)}
            />
            <Field
              label={t("leadTime")}
              name={`lead_${i.id}`}
              inputMode="numeric"
              dir="ltr"
              unit={t("days")}
              defaultValue={v[`lead_${i.id}`] ?? (i.lead_time_days != null ? String(i.lead_time_days) : "")}
              error={err(`lead_${i.id}`)}
            />
          </li>
        ))}
      </ul>
      <p className="m-0 flex items-baseline justify-between gap-3 text-[14px]" aria-live="polite">
        <span className="text-ink-muted">{t("offerTotal")}</span>
        <bdi className="text-[18px] font-semibold tabular-nums">{money(Math.round(total * 100) / 100, cur)}</bdi>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("validUntil")}
          name="validity_until"
          type="date"
          min={tomorrow}
          required
          defaultValue={v.validity_until ?? quote.validity_until?.slice(0, 10) ?? ""}
          error={err("validity_until")}
          help={t("validUntilHelp")}
        />
        <Select label={t("incoterm")} name="incoterm" defaultValue={v.incoterm ?? quote.incoterm ?? ""} help={t("incotermHelp")}>
          <option value="">{t("noIncoterm")}</option>
          {INCOTERMS.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <Textarea label={t("offerNote")} name="note" defaultValue={v.note} help={t("offerNoteHelp")} className="min-h-20" />
      <div>
        <Button type="submit" variant="primary" busy={pending}>{t("sendOffer")}</Button>
      </div>
    </form>
  )
}

export function RejectQuoteForm({ id }: { id: string }) {
  const t = useTranslations("quotes")
  const [open, setOpen] = useState<boolean | null>(null)
  const [state, action, pending] = useActionState(rejectQuote.bind(null, id), {} as FormState)
  const err = useFieldError(state)
  if (!open)
    return (
      <Button autoFocus={open === false} variant="ghost" onClick={() => setOpen(true)}>
        {t("decline")}
      </Button>
    )
  return (
    <form action={action} noValidate className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Textarea label={t("declineReason")} name="note" required autoFocus defaultValue={state.values?.note} help={t("declineReasonHelp")} error={err("note")} className="min-h-20" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" busy={pending}>{t("declineConfirm")}</Button>
        <Button type="button" onClick={() => setOpen(false)}>{t("keep")}</Button>
      </div>
    </form>
  )
}

export function MessageForm({ id }: { id: string }) {
  const t = useTranslations("quotes")
  // `sent` counts successful sends; used as the form key so the textarea clears after each one.
  const [state, action, pending] = useActionState(async (prev: FormState & { sent?: number }, fd: FormData) => {
    const r = await sendQuoteMessage(id, prev, fd)
    return { ...r, sent: (prev.sent ?? 0) + (r.ok ? 1 : 0) }
  }, {} as FormState & { sent?: number })
  const err = useFieldError(state)
  return (
    <form key={state.sent ?? 0} action={action} noValidate className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Textarea label={t("reply")} name="body" defaultValue={state.ok ? "" : state.values?.body} error={err("body")} className="min-h-20" />
      <div>
        <Button type="submit" busy={pending}>{t("send")}</Button>
      </div>
    </form>
  )
}
