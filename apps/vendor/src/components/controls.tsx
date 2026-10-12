"use client"

import { useLocale } from "next-intl"
import { useId, type ReactNode } from "react"
import { Select, type SelectProps } from "@icommerce/ui"

// Checkbox in the same markup as @icommerce/ui Field. Select/Textarea live in @icommerce/ui.
export { Select, Textarea } from "@icommerce/ui"

export function Checkbox({ label, help, name, defaultChecked }: { label: ReactNode; help?: ReactNode; name: string; defaultChecked?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        aria-describedby={help ? `${id}-note` : undefined}
        className="mt-0.5 size-4 flex-none accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="ic-label">{label}</label>
        {help && <span id={`${id}-note`} className="ic-help">{help}</span>}
      </div>
    </div>
  )
}

// ponytail: short list of export/import markets; full ISO list when a vendor outside it signs up.
const COUNTRIES = ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "LB", "MA", "TN", "DZ", "LY", "SD", "TR", "CN", "IN", "DE", "IT", "GB", "US"]

export function CountrySelect(props: SelectProps) {
  const names = new Intl.DisplayNames([useLocale()], { type: "region" })
  return (
    <Select {...props}>
      {COUNTRIES.map((c) => (
        <option key={c} value={c}>{names.of(c)}</option>
      ))}
    </Select>
  )
}
