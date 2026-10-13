"use client"

import { useActionState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, Field, LoginCard } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { signIn, signUp } from "@/lib/account-actions"
import type { FormState } from "@/lib/forms"
import { FormMessage, useFieldError } from "./FormMessage"

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path)

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("login")
  const [state, action, pending] = useActionState(signIn, {} as FormState)
  const err = useFieldError(state)
  return (
    <LoginCard
      className="min-h-dvh"
      action={action}
      noValidate
      sub={t("sub")}
      meta={
        <>
          <span>
            {t("newHere")} <Link href={withNext("/register", next)}>{t("create")}</Link>
          </span>
          <span>
            {t("guestOrder")} <Link href="/track">{t("track")}</Link>
          </span>
        </>
      }
    >
      <input type="hidden" name="locale" value={useLocale()} />
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <Field label={t("email")} name="email" type="email" autoComplete="username" placeholder="you@example.com" dir="ltr" required defaultValue={state.values?.email} error={err("email")} />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" dir="ltr" required error={err("password")} />
      <Button type="submit" variant="primary" block busy={pending}>{t("submit")}</Button>
    </LoginCard>
  )
}

export function RegisterForm({ next }: { next?: string }) {
  const t = useTranslations("register")
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
          {t("haveAccount")} <Link href={withNext("/login", next)}>{t("signIn")}</Link>
        </span>
      }
    >
      <input type="hidden" name="locale" value={useLocale()} />
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("firstName")} name="first_name" autoComplete="given-name" required defaultValue={v.first_name} error={err("first_name")} />
        <Field label={t("lastName")} name="last_name" autoComplete="family-name" required defaultValue={v.last_name} error={err("last_name")} />
      </div>
      <Field label={t("email")} name="email" type="email" autoComplete="email" placeholder="you@example.com" dir="ltr" required defaultValue={v.email} error={err("email")} />
      <Field label={t("password")} name="password" type="password" autoComplete="new-password" dir="ltr" required help={t("passwordHelp")} error={err("password")} />
      <Button type="submit" variant="primary" block busy={pending}>{t("submit")}</Button>
    </LoginCard>
  )
}
