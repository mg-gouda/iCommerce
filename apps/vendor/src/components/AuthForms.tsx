"use client"

import { useActionState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, Field, LoginCard } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { signIn, signUp } from "@/lib/auth-actions"
import type { FormState } from "@/lib/types"
import { FormMessage, useFieldError } from "./FormMessage"
import { CountrySelect } from "./controls"

export function LoginForm({ expired }: { expired?: boolean }) {
  const t = useTranslations("login")
  const locale = useLocale()
  const [state, action, pending] = useActionState(signIn, (expired ? { message: "expired" } : {}) as FormState)
  const err = useFieldError(state)
  return (
    <LoginCard
      className="min-h-dvh"
      action={action}
      noValidate
      sub={t("sub")}
      meta={
        <>
          <Link href="/login">{t("forgot")}</Link>
          <Link href="/signup">{t("apply")}</Link>
        </>
      }
    >
      <input type="hidden" name="locale" value={locale} />
      <FormMessage state={state} />
      <Field label={t("email")} name="email" type="email" autoComplete="username" placeholder="you@company.com" dir="ltr" required defaultValue={state.values?.email} error={err("email")} />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" dir="ltr" required error={err("password")} />
      <Button type="submit" variant="primary" block busy={pending}>
        {t("submit")}
      </Button>
    </LoginCard>
  )
}

export function SignupForm() {
  const t = useTranslations("signup")
  const locale = useLocale()
  const [state, action, pending] = useActionState(signUp, {} as FormState)
  const err = useFieldError(state)
  const v = state.values ?? {}
  return (
    <LoginCard
      className="min-h-dvh"
      action={action}
      noValidate
      sub={t("sub")}
      meta={
        <span>
          {t("haveAccount")} <Link href="/login">{t("signIn")}</Link>
        </span>
      }
    >
      <input type="hidden" name="locale" value={locale} />
      <FormMessage state={state} />
      <Field label={t("company")} name="name" autoComplete="organization" required defaultValue={v.name} error={err("name")} />
      <CountrySelect label={t("country")} name="country" required defaultValue={v.country || "EG"} error={err("country")} />
      <Field label={t("phone")} name="phone" type="tel" autoComplete="tel" placeholder="+20 100 000 0000" dir="ltr" defaultValue={v.phone} error={err("phone")} />
      <Field label={t("email")} name="email" type="email" autoComplete="email" placeholder="you@company.com" dir="ltr" required defaultValue={v.email} error={err("email")} />
      <Field label={t("password")} name="password" type="password" autoComplete="new-password" dir="ltr" required help={t("passwordHelp")} error={err("password")} />
      <Button type="submit" variant="primary" block busy={pending}>
        {t("submit")}
      </Button>
    </LoginCard>
  )
}
