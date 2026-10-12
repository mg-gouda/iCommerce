"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@icommerce/ui"
import { importCsv, type ImportResult } from "@/lib/product-actions"
import { Select } from "./controls"
import { FormMessage, useFieldError } from "./FormMessage"
import { panel } from "./PageHeader"
import { FileField } from "./StoreForms"

// Backend row errors are fixed English strings (p1-backend.md §3 import); map them to translated hints, unknown ones stay verbatim.
const ROW_ERRORS: [RegExp, string][] = [
  [/^title is required$/, "title"],
  [/^price_usd must be/, "price"],
  [/^compare_at_usd must be/, "compareAt"],
  [/^(min_qty|qty_step) must be a positive integer$/, "positiveInt"],
  [/^b2b_only must be/, "b2bOnly"],
  [/^handle must be/, "handleFormat"],
  [/^unknown category_handle "(.*)"$/, "category"],
  [/handle: (.*), already exists/, "handleTaken"],
]

export function ImportForm({ approved }: { approved: boolean }) {
  const t = useTranslations("import")
  const [state, action, pending] = useActionState(importCsv, {} as ImportResult)
  const err = useFieldError(state)
  const rowError = (m: string) => {
    for (const [re, key] of ROW_ERRORS) {
      const hit = m.match(re)
      if (hit) return t(`rowErrors.${key}`, { value: hit[1] ?? "" })
    }
    return m
  }
  return (
    <>
      <form action={action} noValidate className={`${panel} flex flex-col gap-4`}>
        <FormMessage state={state} />
        <FileField label={t("file")} name="file" accept=".csv,text/csv" required help={t("fileHelp")} error={err("file")} />
        <Select label={t("status")} name="status" defaultValue="draft" help={approved ? undefined : t("pendingHelp")}>
          <option value="draft">{t("asDraft")}</option>
          <option value="published">{approved ? t("asPublished") : t("asProposed")}</option>
        </Select>
        <Button type="submit" variant="primary" busy={pending} className="self-start">{t("submit")}</Button>
      </form>

      {state.ok && (
        <section aria-labelledby="result" aria-live="polite" className="flex flex-col gap-3">
          <h2 id="result" className="m-0 text-[20px] leading-[26px] font-semibold">{t("result")}</h2>
          <p className="m-0">
            {t("summary", { created: state.created?.length ?? 0, failed: state.errors?.length ?? 0 })}
          </p>
          {!!state.errors?.length && (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full border-collapse text-[14px]">
                <caption className="sr-only">{t("errorsCaption")}</caption>
                <thead>
                  <tr className="bg-ground text-[12px] text-ink-muted">
                    <th scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium">{t("row")}</th>
                    <th scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium">{t("handle")}</th>
                    <th scope="col" className="border-b border-line px-4 py-2.5 text-start font-medium">{t("problems")}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.errors.map((r) => (
                    <tr key={r.row} className="border-b border-line align-top last:border-b-0">
                      <td className="px-4 py-2.5 tabular-nums">{r.row}</td>
                      <td dir="ltr" className="px-4 py-2.5 text-start font-mono text-[13px]">{r.handle || "—"}</td>
                      <td className="px-4 py-2.5">
                        <ul className="m-0 list-disc ps-5 text-danger">
                          {r.errors.map((m) => <li key={m}>{rowError(m)}</li>)}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
