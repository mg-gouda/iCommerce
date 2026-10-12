"use client"

import { useActionState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@icommerce/ui"
import { addAddress } from "@/lib/account-actions"
import type { FormState } from "@/lib/forms"
import { AddressFields } from "./AddressFields"
import { FormMessage, useFieldError } from "./FormMessage"

export function AddAddressForm() {
  const t = useTranslations("account")
  const [state, run, pending] = useActionState(addAddress, {} as FormState)
  const err = useFieldError(state)
  return (
    <form action={run} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={useLocale()} />
      <FormMessage state={state} />
      <AddressFields values={state.ok ? {} : (state.values ?? {})} err={err} />
      <Button type="submit" variant="primary" busy={pending} className="self-start">{t("saveAddress")}</Button>
    </form>
  )
}
