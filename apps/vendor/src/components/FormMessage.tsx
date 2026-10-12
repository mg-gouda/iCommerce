"use client"

import { CircleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import type { FormState } from "@/lib/types"

/** Form-level error: a known `errors.*` key, else the API message as-is. Live region is always mounted. */
export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  const t = useTranslations("errors")
  const msg = state.message
  return (
    <p role="alert" className={`ic-error m-0 items-start empty:hidden ${className ?? ""}`}>
      {msg && (
        <>
          <CircleAlert aria-hidden className="mt-0.5" />
          <span>{t.has(msg) ? t(msg) : msg}</span>
        </>
      )}
    </p>
  )
}

/** Field-error key from a FormState → translated message. */
export function useFieldError(state: FormState) {
  const t = useTranslations("errors")
  return (name: string) => {
    const k = state.fieldErrors?.[name]
    return k ? (t.has(k) ? t(k) : k) : undefined
  }
}
