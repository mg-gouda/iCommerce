import { useId, type InputHTMLAttributes, type ReactNode } from "react"
import { CircleAlert } from "lucide-react"
import { cx } from "./cx"

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  help?: ReactNode
  /** Say what went wrong and how to fix it. Sets aria-invalid. */
  error?: ReactNode
  /** Unit addon, e.g. "pieces", "m²", "USD". */
  unit?: ReactNode
  mono?: boolean
}

export function Field({ label, help, error, unit, mono, id, className, ...props }: FieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  const noteId = `${inputId}-note`
  const input = (
    <input
      id={inputId}
      className={cx("ic-input", mono && "ic-mono", className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error || help ? noteId : undefined}
      {...props}
    />
  )
  return (
    <div className="ic-field">
      <label className="ic-label" htmlFor={inputId}>
        {label}
      </label>
      {unit ? (
        <div className="ic-input-group">
          {input}
          <span className="ic-addon">{unit}</span>
        </div>
      ) : (
        input
      )}
      {error ? (
        <span className="ic-error" id={noteId}>
          <CircleAlert aria-hidden /> {error}
        </span>
      ) : help ? (
        <span className="ic-help" id={noteId}>
          {help}
        </span>
      ) : null}
    </div>
  )
}
