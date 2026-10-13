"use client"

import { CircleAlert } from "lucide-react"
import { useActionState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, Field, Select, Textarea, qtyUnit } from "@icommerce/ui"
import type { FormState } from "@/lib/forms"
import { removeDraftLine, submitRfq } from "@/lib/p3/actions"
import { FormMessage, useFieldError } from "./FormMessage"

export type ReviewLine = {
  title: string
  quantity: number
  unit: string | null
  vendor: string | null
  moq: number | null
  /** Free-text lines: suppliers whose catalog matches the text (handle, name). */
  suggest?: { handle: string; name: string }[]
}

const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"]

/** RFQ review: per-line quantity (decimals ok) + optional target price, suppliers for free-text lines, notes, Incoterm. */
export function RfqReviewForm({ lines, canSubmit }: { lines: ReviewLine[]; canSubmit: boolean }) {
  const t = useTranslations("b2b")
  const tu = useTranslations("units")
  const [state, run, pending] = useActionState(submitRfq, {} as FormState)
  const err = useFieldError(state)
  const v = state.values ?? {}
  return (
    <form action={run} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={useLocale()} />
      <FormMessage state={state} />
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {lines.map((l, i) => {
          const vendorErr = err(`vendor_${i}`)
          const picked = v[`vendor_${i}`]?.split(",")
          return (
            <li key={i} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div dir="auto" className="text-start font-semibold">{l.title}</div>
                  <div className="text-[13px] text-ink-muted">
                    {l.vendor ?? t("freeText")}
                    {l.moq ? <> · {t("moqLine", { qty: qtyUnit(tu, l.moq, l.unit ?? "piece") })}</> : null}
                  </div>
                </div>
                <Button type="submit" variant="ghost" size="sm" formAction={removeDraftLine} name="i" value={i} formNoValidate aria-label={t("removeLine", { title: l.title })}>
                  {t("remove")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-0 flex-[1_1_180px]">
                  <Field label={t("qty")} name={`qty_${i}`} inputMode="decimal" dir="ltr" className="ic-num" unit={l.unit ? t.has(`unitName.${l.unit}`) ? t(`unitName.${l.unit}`) : l.unit : undefined}
                    defaultValue={v[`qty_${i}`] ?? String(l.quantity)} error={err(`qty_${i}`)} help={t("qtyHelp")} />
                </div>
                <div className="min-w-0 flex-[1_1_180px]">
                  <Field label={t("targetPrice")} name={`target_${i}`} inputMode="decimal" dir="ltr" className="ic-num" unit="USD"
                    defaultValue={v[`target_${i}`]} error={err(`target_${i}`)} help={t("targetHelp")} />
                </div>
              </div>
              {l.suggest && (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={vendorErr ? `v${i}-err` : undefined}>
                  <legend className="ic-label mb-1 p-0">{t("sendTo")}</legend>
                  {l.suggest.length ? (
                    <div className="flex flex-wrap gap-2">
                      {l.suggest.map((s) => (
                        <label key={s.handle} className="flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-[14px] has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring">
                          <input type="checkbox" name={`vendor_${i}`} value={s.handle} defaultChecked={picked?.includes(s.handle)} className="size-4 accent-brand" />
                          <bdi>{s.name}</bdi>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="m-0 text-[14px] text-ink-muted">{t("noSuggest")}</p>
                  )}
                  {vendorErr && <span id={`v${i}-err`} className="ic-error"><CircleAlert aria-hidden /> {vendorErr}</span>}
                </fieldset>
              )}
            </li>
          )
        })}
      </ol>
      <div className="grid max-w-[860px] grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
        <Textarea label={t("notes")} name="notes" help={t("notesHelp")} defaultValue={v.notes} />
        <Select label={t("incoterm")} name="incoterm" defaultValue={v.incoterm ?? ""} help={t("incotermHelp")}>
          <option value="">{t("incotermAny")}</option>
          {INCOTERMS.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Button type="submit" variant="primary" size="lg" busy={pending} disabled={!canSubmit} className="self-start">{t("rfqSubmit")}</Button>
        <span className="ic-help">{t("rfqSubmitHelp")}</span>
      </div>
    </form>
  )
}
