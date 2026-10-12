"use client"

import { useLocale, useTranslations } from "next-intl"
import { Field, Select } from "@icommerce/ui"
import { GOVERNORATES } from "@/lib/governorates"

type Values = Partial<Record<"first_name" | "last_name" | "phone" | "province" | "city" | "address_1" | "address_2", string | null>>

/** Egyptian delivery address: names, mobile, governorate, city, street. Country is fixed (we ship within Egypt). */
export function AddressFields({ values, err }: { values: Values; err: (name: string) => string | undefined }) {
  const t = useTranslations("address")
  const ar = useLocale() === "ar"
  const v = (k: keyof Values) => values[k] ?? undefined
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t("firstName")} name="first_name" autoComplete="given-name" required defaultValue={v("first_name")} error={err("first_name")} />
      <Field label={t("lastName")} name="last_name" autoComplete="family-name" required defaultValue={v("last_name")} error={err("last_name")} />
      <Field label={t("phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="010 1234 5678" required help={t("phoneHelp")} defaultValue={v("phone")} error={err("phone")} />
      <Select label={t("governorate")} name="province" required defaultValue={v("province") ?? ""} error={err("province")} autoComplete="address-level1">
        <option value="" disabled>{t("pick")}</option>
        {GOVERNORATES.map(([code, en, arName]) => (
          <option key={code} value={code}>{ar ? arName : en}</option>
        ))}
      </Select>
      <Field label={t("city")} name="city" autoComplete="address-level2" required defaultValue={v("city")} error={err("city")} />
      <Field label={t("line1")} name="address_1" autoComplete="address-line1" required help={t("line1Help")} defaultValue={v("address_1")} error={err("address_1")} />
      <div className="sm:col-span-2">
        <Field label={t("line2")} name="address_2" autoComplete="address-line2" defaultValue={v("address_2")} />
      </div>
    </div>
  )
}
