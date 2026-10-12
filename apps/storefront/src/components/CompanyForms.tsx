"use client"

import { useLocale, useTranslations } from "next-intl"
import { Button, Field, Select } from "@icommerce/ui"
import { countryOptions } from "@/lib/countries"
import { acceptInvite, createCompany, invite, removeMember, setRole, submitKyc } from "@/lib/p3/actions"
import { ROLES, type Role } from "@/lib/p3/types"
import { ActionForm as Form, Done } from "./ActionForm"

export function CreateCompanyForm() {
  const t = useTranslations("b2b")
  const locale = useLocale()
  return (
    <Form action={createCompany}>
      {(s, err, pending) => {
        const v = s.values ?? {}
        return (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t("companyName")} name="name" autoComplete="organization" required defaultValue={v.name} error={err("name")} />
              </div>
              <Select label={t("country")} name="country" required defaultValue={v.country ?? "EG"} error={err("country")} autoComplete="country">
                {countryOptions(locale).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </Select>
              <Field label={t("city")} name="city" autoComplete="address-level2" required defaultValue={v.city} error={err("city")} />
              <Field label={t("address")} name="address" autoComplete="street-address" required defaultValue={v.address} error={err("address")} />
              <Field label={t("phone")} name="phone" type="tel" autoComplete="tel" dir="ltr" placeholder="+20 2 1234 5678" required defaultValue={v.phone} error={err("phone")} />
            </div>
            <Button type="submit" variant="primary" busy={pending} className="self-start">{t("createCompany")}</Button>
          </>
        )
      }}
    </Form>
  )
}

export function KycForm({ values }: { values: { tax_id: string | null; commercial_reg_no: string | null; export_card_no: string | null } }) {
  const t = useTranslations("b2b")
  return (
    <Form action={submitKyc}>
      {(s, err, pending) => {
        if (s.ok) return <Done>{t("kycSent")}</Done>
        const v = { ...values, ...s.values }
        return (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t("taxId")} name="tax_id" dir="ltr" mono required defaultValue={v.tax_id ?? undefined} error={err("tax_id")} />
              <Field label={t("crNo")} name="commercial_reg_no" dir="ltr" mono required defaultValue={v.commercial_reg_no ?? undefined} error={err("commercial_reg_no")} />
              <Field label={t("exportCard")} name="export_card_no" dir="ltr" mono help={t("optional")} defaultValue={v.export_card_no ?? undefined} />
            </div>
            <Field
              label={t("kycFiles")}
              name="files"
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              required
              help={t("kycFilesHelp")}
              error={err("files")}
              className="py-1.5"
            />
            <Button type="submit" variant="primary" busy={pending} className="self-start">{t("kycSubmit")}</Button>
          </>
        )
      }}
    </Form>
  )
}

export function InviteForm() {
  const t = useTranslations("b2b")
  return (
    <Form action={invite}>
      {(s, err, pending) => (
        <>
          {s.ok && <Done>{t("inviteSent")}</Done>}
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-[2_1_240px]">
              <Field label={t("email")} name="email" type="email" autoComplete="off" dir="ltr" required defaultValue={s.ok ? "" : s.values?.email} error={err("email")} key={s.ok ? "sent" : "draft"} />
            </div>
            <div className="min-w-0 flex-[1_1_160px]">
              <Select label={t("role")} name="role" defaultValue={s.values?.role ?? "buyer"} help={t("roleHelp")}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
              </Select>
            </div>
          </div>
          <Button type="submit" variant="primary" busy={pending} className="self-start">{t("invite")}</Button>
        </>
      )}
    </Form>
  )
}

/** Role picker + save, per member row (admin only). */
export function RoleForm({ id, role, label }: { id: string; role: Role; label: string }) {
  const t = useTranslations("b2b")
  return (
    <Form action={setRole} hidden={{ id }} className="flex flex-wrap items-center gap-2">
      {(_, __, pending) => (
        <>
          <label className="sr-only" htmlFor={`role-${id}`}>{t("roleFor", { name: label })}</label>
          <select id={`role-${id}`} name="role" defaultValue={role} className="ic-input h-8 w-auto py-0 text-[14px]">
            {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </select>
          <Button type="submit" size="sm" busy={pending}>{t("save")}</Button>
        </>
      )}
    </Form>
  )
}

export function RemoveForm({ id, label }: { id: string; label: string }) {
  const t = useTranslations("b2b")
  return (
    <Form action={removeMember} hidden={{ id }} className="flex flex-col items-end gap-1">
      {(_, __, pending) => (
        <Button type="submit" variant="ghost" size="sm" busy={pending} aria-label={t("removeWho", { name: label })}>{t("remove")}</Button>
      )}
    </Form>
  )
}

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("b2b")
  return (
    <Form action={acceptInvite} hidden={{ token }}>
      {(_, __, pending) => <Button type="submit" variant="primary" busy={pending} className="self-start">{t("joinAccept")}</Button>}
    </Form>
  )
}
