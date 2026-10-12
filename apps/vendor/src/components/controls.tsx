"use client"

import { CircleAlert } from "lucide-react"
import { useLocale } from "next-intl"
import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"

// Select / textarea / checkbox in the same markup as @icommerce/ui Field (label, help, error, aria wiring).
// ponytail: vendor-only for now; move to packages/ui when the storefront needs them.

type Wrap = { label: ReactNode; help?: ReactNode; error?: ReactNode }

function Note({ id, help, error }: { id: string; help?: ReactNode; error?: ReactNode }) {
  if (error)
    return (
      <span className="ic-error" id={id}>
        <CircleAlert aria-hidden /> {error}
      </span>
    )
  return help ? <span className="ic-help" id={id}>{help}</span> : null
}

export function Select({ label, help, error, children, className, ...props }: Wrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div className="ic-field">
      <label className="ic-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className={`ic-input ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? `${id}-note` : undefined}
        {...props}
      >
        {children}
      </select>
      <Note id={`${id}-note`} help={help} error={error} />
    </div>
  )
}

export function Textarea({ label, help, error, className, ...props }: Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className="ic-field">
      <label className="ic-label" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className={`ic-input min-h-28 py-2 ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? `${id}-note` : undefined}
        {...props}
      />
      <Note id={`${id}-note`} help={help} error={error} />
    </div>
  )
}

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

export function CountrySelect(props: Wrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const names = new Intl.DisplayNames([useLocale()], { type: "region" })
  return (
    <Select {...props}>
      {COUNTRIES.map((c) => (
        <option key={c} value={c}>{names.of(c)}</option>
      ))}
    </Select>
  )
}
