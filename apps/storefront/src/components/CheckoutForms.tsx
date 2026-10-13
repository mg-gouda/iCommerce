"use client"

import { CircleAlert } from "lucide-react"
import { useActionState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, Field, money } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"
import { placeOrder, saveAddress, saveEmail, savePayment, saveShipping } from "@/lib/checkout-actions"
import type { PayKind, ShipGroup } from "@/lib/checkout"
import type { FormState } from "@/lib/forms"
import { AddressFields } from "./AddressFields"
import { FormMessage, useFieldError } from "./FormMessage"

type Action = (s: FormState, fd: FormData) => Promise<FormState>

/** Section form: locale for the redirect, form-level error, one plain submit. */
function StepForm({ action, submit, children }: { action: Action; submit: string; children: (s: FormState, err: (name: string) => string | undefined) => ReactNode }) {
  const [state, run, pending] = useActionState(action, {} as FormState)
  const err = useFieldError(state)
  return (
    <form action={run} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={useLocale()} />
      <FormMessage state={state} />
      {children(state, err)}
      <Button type="submit" variant="primary" busy={pending} className="self-start">{submit}</Button>
    </form>
  )
}

export function EmailForm({ email }: { email?: string | null }) {
  const t = useTranslations("checkout")
  return (
    <StepForm action={saveEmail} submit={t("continue")}>
      {(s, err) => (
        <>
          <Field label={t("email")} name="email" type="email" autoComplete="email" dir="ltr" required help={t("emailHelp")}
            defaultValue={s.values?.email ?? email ?? undefined} error={err("email")} />
          <p className="m-0 text-[14px] text-ink-muted">
            {t("haveAccount")} <Link href="/login?next=/checkout" className="text-brand-ink underline underline-offset-2">{t("signIn")}</Link>
          </p>
        </>
      )}
    </StepForm>
  )
}

export function AddressForm({ address }: { address: Record<string, string | null> }) {
  const t = useTranslations("checkout")
  return (
    <StepForm action={saveAddress} submit={t("continue")}>
      {(s, err) => <AddressFields values={s.values ?? address} err={err} />}
    </StepForm>
  )
}

/** A radio rendered as a selectable card (label wraps input → whole card clickable). */
function Choice({ name, value, checked, children, describedBy, disabled }: { name: string; value: string; checked?: boolean; children: ReactNode; describedBy?: string; disabled?: boolean }) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-md border border-line-strong bg-surface p-3 hover:border-ink-muted has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:disabled]:cursor-not-allowed has-[:disabled]:border-line has-[:disabled]:bg-ground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring">
      <input type="radio" name={name} value={value} defaultChecked={checked && !disabled} disabled={disabled} aria-describedby={describedBy} className="mt-1 size-4 flex-none accent-brand focus-visible:outline-none" />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">{children}</span>
    </label>
  )
}

function GroupError({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <span id={id} className="ic-error">
      <CircleAlert aria-hidden /> {msg}
    </span>
  ) : null
}

export function ShippingForm({ groups, currency }: { groups: ShipGroup[]; currency: string }) {
  const t = useTranslations("checkout")
  return (
    <StepForm action={saveShipping} submit={t("continue")}>
      {(s, err) =>
        groups.map((g) => {
          const name = `ship_${g.profileId}`
          const e = err(name)
          return (
            <fieldset key={g.profileId} className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 font-semibold">{t("shipFrom", { vendor: g.vendor?.name ?? t("supplier") })}</legend>
              {!g.options.length && <p className="ic-error m-0">{t("vendorNoDelivery")}</p>}
              {g.options.map((o) => (
                <Choice key={o.id} name={name} value={o.id} checked={o.id === (s.values?.[name] || g.selected) || g.options.length === 1} describedBy={e ? `${name}-err` : undefined}>
                  <span>
                    <span className="font-medium">{o.name}</span>
                    {o.kind === "pickup" && <span className="block text-[13px] text-ink-muted">{t("pickupHelp")}</span>}
                    {o.kind === "free_over" && o.free_over != null && (
                      <span className="block text-[13px] text-ink-muted">{t("freeOver", { price: money(o.free_over, currency) })}</span>
                    )}
                  </span>
                  <bdi className="font-semibold tabular-nums">{o.amount ? money(o.amount, currency) : t("free")}</bdi>
                </Choice>
              ))}
              <GroupError id={`${name}-err`} msg={e} />
            </fieldset>
          )
        })
      }
    </StepForm>
  )
}

type Net = { days: number; available: string; refusal: "limit" | "overdue" | "hold" | null }

export function PaymentForm({ providers, selected, net }: { providers: { id: string; kind: PayKind }[]; selected?: string; net?: Net | null }) {
  const t = useTranslations("checkout")
  return (
    <StepForm action={savePayment} submit={t("continue")}>
      {(s, err) => {
        const e = err("provider")
        return (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">{t("payment")}</legend>
            {providers.map((p) => (
              <Choice key={p.id} name="provider" value={p.id} checked={p.id === (s.values?.provider || selected) || providers.length === 1} describedBy={e ? "provider-err" : undefined} disabled={p.kind === "net" && !!net?.refusal}>
                <span>
                  <span className="font-medium">{t(`pay.${p.kind}`, { n: net?.days ?? 30 })}</span>
                  <span className="block text-[13px] text-ink-muted">{t(`pay.${p.kind}Help`, { n: net?.days ?? 30, available: net?.available ?? "" })}</span>
                  {p.kind === "net" && net?.refusal && (
                    <span className="mt-1 flex items-start gap-1.5 text-[13px] text-danger">
                      <CircleAlert size={14} aria-hidden className="mt-0.5 flex-none" /> {t(`pay.net_${net.refusal}`, { available: net.available })}
                    </span>
                  )}
                </span>
              </Choice>
            ))}
            <GroupError id="provider-err" msg={e} />
          </fieldset>
        )
      }}
    </StepForm>
  )
}

export function PlaceOrderForm({ label }: { label: string }) {
  const t = useTranslations("checkout")
  const [state, run, pending] = useActionState(placeOrder, {} as FormState)
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={useLocale()} />
      <FormMessage state={state} />
      <Button type="submit" variant="primary" size="lg" block busy={pending}>{label}</Button>
      <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{t("placeNote")}</p>
    </form>
  )
}
