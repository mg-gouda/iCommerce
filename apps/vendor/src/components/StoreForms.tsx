"use client"

import { Check } from "lucide-react"
import Image from "next/image"
import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { Button, Field } from "@icommerce/ui"
import { saveProfile, submitKyc } from "@/lib/store-actions"
import type { FormState, Vendor } from "@/lib/types"
import { CountrySelect, Textarea } from "./controls"
import { FormMessage, useFieldError } from "./FormMessage"
import { panel } from "./PageHeader"

export function Saved({ show, label }: { show?: boolean; label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
      {show && (
        <>
          <Check size={16} aria-hidden /> {label}
        </>
      )}
    </span>
  )
}

const fileInput =
  "block w-full text-[13px] text-ink-muted file:me-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:font-semibold file:text-ink hover:file:bg-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"

export function FileField({ label, help, error, ...props }: { label: string; help?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label} help={help} error={error} type="file" className={`${fileInput} h-auto border-0 bg-transparent px-0`} {...props} />
}

export function ProfileForm({ vendor }: { vendor: Vendor }) {
  const t = useTranslations("settings")
  const [state, action, pending] = useActionState(saveProfile, {} as FormState)
  const err = useFieldError(state)
  const v = state.values ?? (vendor as unknown as Record<string, string>)
  return (
    <form action={action} noValidate className={`${panel} grid max-w-[880px] gap-4 md:grid-cols-2`}>
      <FormMessage state={state} className="md:col-span-2" />
      <Field label={t("name")} name="name" required defaultValue={v.name ?? ""} error={err("name")} />
      <Field label={t("email")} name="email" type="email" dir="ltr" defaultValue={v.email ?? ""} help={t("emailHelp")} error={err("email")} />
      <Field label={t("phone")} name="phone" type="tel" dir="ltr" defaultValue={v.phone ?? ""} error={err("phone")} />
      <div className="grid grid-cols-2 gap-4">
        <CountrySelect label={t("country")} name="country" defaultValue={v.country || "EG"} />
        <Field label={t("city")} name="city" defaultValue={v.city ?? ""} />
      </div>
      <div className="md:col-span-2">
        <Textarea label={t("description")} name="description" defaultValue={v.description ?? ""} help={t("descriptionHelp")} />
      </div>
      <div className="flex flex-col gap-2">
        {vendor.logo && <Image src={vendor.logo} alt={t("currentLogo")} width={64} height={64} className="size-16 rounded-md border border-line object-cover" />}
        <FileField label={t("logo")} name="logo" accept="image/png,image/jpeg,image/webp" help={t("logoHelp")} error={err("logo")} />
      </div>
      <div className="flex flex-col gap-2">
        {vendor.banner && <Image src={vendor.banner} alt={t("currentBanner")} width={256} height={64} className="h-16 w-full max-w-64 rounded-md border border-line object-cover" />}
        <FileField label={t("banner")} name="banner" accept="image/png,image/jpeg,image/webp" help={t("bannerHelp")} error={err("banner")} />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" variant="primary" busy={pending}>{t("save")}</Button>
        <Saved show={state.ok && !pending} label={t("saved")} />
      </div>
    </form>
  )
}

export function KycForm({ vendor }: { vendor: Vendor }) {
  const t = useTranslations("kyc")
  const [state, action, pending] = useActionState(submitKyc, {} as FormState)
  const err = useFieldError(state)
  const v = state.values ?? {
    tax_id: vendor.tax_id ?? "",
    commercial_reg_no: vendor.commercial_reg_no ?? "",
    export_card_no: vendor.export_card_no ?? "",
  }
  return (
    <form action={action} noValidate className={`${panel} flex max-w-[640px] flex-col gap-4`}>
      <FormMessage state={state} />
      <Field label={t("taxId")} name="tax_id" mono dir="ltr" inputMode="numeric" placeholder="512-483-907" required defaultValue={v.tax_id} help={t("taxIdHelp")} error={err("tax_id")} />
      <Field label={t("crNo")} name="commercial_reg_no" mono dir="ltr" inputMode="numeric" required defaultValue={v.commercial_reg_no} help={t("crNoHelp")} error={err("commercial_reg_no")} />
      <Field label={t("exportCard")} name="export_card_no" mono dir="ltr" defaultValue={v.export_card_no} help={t("exportCardHelp")} error={err("export_card_no")} />
      <FileField label={t("files")} name="files" multiple required accept="application/pdf,image/png,image/jpeg,image/webp" help={t("filesHelp")} error={err("files")} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" busy={pending}>{t("submit")}</Button>
        <Saved show={state.ok && !pending} label={t("submitted")} />
      </div>
    </form>
  )
}
