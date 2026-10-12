"use client"

import { useTranslations } from "next-intl"
import { Button, Field, Textarea } from "@icommerce/ui"
import { acceptQuote, approveQuote, counter, rejectQuote, sendMessage } from "@/lib/p3/actions"
import type { QuoteItem } from "@/lib/p3/types"
import { ActionForm, Done } from "./ActionForm"

export function AcceptForm({ quote, label, help }: { quote: string; label: string; help: string }) {
  return (
    <ActionForm action={acceptQuote} hidden={{ quote }} className="flex flex-col gap-1.5">
      {(_, __, pending) => (
        <>
          <Button type="submit" variant="primary" size="lg" busy={pending} className="self-start" aria-describedby={`accept-${quote}`}>{label}</Button>
          <span id={`accept-${quote}`} className="ic-help">{help}</span>
        </>
      )}
    </ActionForm>
  )
}

export function ApproveForm({ quote }: { quote: string }) {
  const t = useTranslations("b2b")
  return (
    <ActionForm action={approveQuote} hidden={{ quote }}>
      {(_, __, pending) => <Button type="submit" variant="primary" size="lg" busy={pending} className="self-start">{t("approve")}</Button>}
    </ActionForm>
  )
}

/** Reject behind a disclosure: the reason field only shows once the buyer means it (no modal). */
export function RejectForm({ quote, label }: { quote: string; label: string }) {
  const t = useTranslations("b2b")
  return (
    <details className="group">
      <summary className="ic-btn ic-btn--ghost cursor-pointer list-none group-open:hidden">{label}</summary>
      <ActionForm action={rejectQuote} hidden={{ quote }} className="flex max-w-[560px] flex-col gap-3">
        {(_, __, pending) => (
          <>
            <Textarea label={t("rejectReason")} name="reason" help={t("optional")} className="min-h-20" />
            <Button type="submit" variant="danger" busy={pending} className="self-start">{label}</Button>
          </>
        )}
      </ActionForm>
    </details>
  )
}

/** Counter-offer: per-item target price (prefilled with the current target) + a required message. */
export function CounterForm({ quote, items, currency }: { quote: string; items: QuoteItem[]; currency: string }) {
  const t = useTranslations("b2b")
  return (
    <ActionForm action={counter} hidden={{ quote }}>
      {(s, err, pending) => (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <Field key={i.id} label={t("targetFor", { title: i.title })} name={`target_${i.id}`} inputMode="decimal" dir="ltr" className="ic-num" unit={currency}
                defaultValue={s.values?.[`target_${i.id}`] ?? (i.target_price != null ? String(i.target_price) : "")} error={err(`target_${i.id}`)} />
            ))}
          </div>
          <Textarea label={t("counterMessage")} name="message" required help={t("counterHelp")} defaultValue={s.values?.message} error={err("message")} className="min-h-20" />
          <Button type="submit" busy={pending} className="self-start">{t("sendCounter")}</Button>
        </>
      )}
    </ActionForm>
  )
}

export function MessageForm({ quote }: { quote: string }) {
  const t = useTranslations("b2b")
  return (
    <ActionForm action={sendMessage} hidden={{ quote }} className="flex flex-col gap-3">
      {(s, err, pending) => (
        <>
          {s.ok && <Done>{t("messageSent")}</Done>}
          <Textarea label={t("message")} name="body" required error={err("body")} className="min-h-20" />
          <Button type="submit" busy={pending} className="self-start">{t("send")}</Button>
        </>
      )}
    </ActionForm>
  )
}
