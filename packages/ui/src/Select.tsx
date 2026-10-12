"use client"

import { CircleAlert } from "lucide-react"
import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"
import { cx } from "./cx"

// Select / textarea in the same markup as Field (label, help, error, aria wiring).

type Wrap = { label: ReactNode; help?: ReactNode; error?: ReactNode }
export type SelectProps = Wrap & SelectHTMLAttributes<HTMLSelectElement>
export type TextareaProps = Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>

function Note({ id, help, error }: { id: string; help?: ReactNode; error?: ReactNode }) {
  if (error)
    return (
      <span className="ic-error" id={id}>
        <CircleAlert aria-hidden /> {error}
      </span>
    )
  return help ? <span className="ic-help" id={id}>{help}</span> : null
}

export function Select({ label, help, error, children, className, ...props }: SelectProps) {
  const id = useId()
  return (
    <div className="ic-field">
      <label className="ic-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className={cx("ic-input", className)}
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

export function Textarea({ label, help, error, className, ...props }: TextareaProps) {
  const id = useId()
  return (
    <div className="ic-field">
      <label className="ic-label" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className={cx("ic-input min-h-28 py-2", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? `${id}-note` : undefined}
        {...props}
      />
      <Note id={`${id}-note`} help={help} error={error} />
    </div>
  )
}
