"use client"

import { Check } from "lucide-react"
import { useActionState, type ReactNode } from "react"
import { useLocale } from "next-intl"
import type { FormState } from "@/lib/forms"
import { FormMessage, useFieldError } from "./FormMessage"

type Action = (s: FormState, fd: FormData) => Promise<FormState>

/** Server-action form shell: locale + hidden fields, form-level error; children get state, field errors, pending. */
export function ActionForm({ action, hidden, className, children }: {
  action: Action
  hidden?: Record<string, string>
  className?: string
  children: (s: FormState, err: (n: string) => string | undefined, pending: boolean) => ReactNode
}) {
  const [state, run, pending] = useActionState(action, {} as FormState)
  const err = useFieldError(state)
  return (
    <form action={run} noValidate className={className ?? "flex flex-col gap-4"}>
      <input type="hidden" name="locale" value={useLocale()} />
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <FormMessage state={state} />
      {children(state, err, pending)}
    </form>
  )
}

export function Done({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 flex items-center gap-1.5 text-[14px] text-success">
      <Check size={16} aria-hidden /> {children}
    </p>
  )
}
