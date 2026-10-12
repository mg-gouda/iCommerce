import { GOVERNORATES } from "./governorates"

export type FormState = { values?: Record<string, string>; fieldErrors?: Record<string, string>; message?: string; ok?: boolean }

export const routeLocale = (fd: FormData) => (fd.get("locale") === "ar" ? "ar" : "en")
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim()

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Egyptian mobile → +201XXXXXXXXX, else null. Accepts 01…, +201…, 00201…, spaces/dashes. */
export function egMobile(raw: string) {
  const m = raw.replace(/[\s()-]/g, "").match(/^(?:\+20|0020|0)?(1[0125]\d{8})$/)
  return m ? `+20${m[1]}` : null
}

const ADDRESS = ["first_name", "last_name", "phone", "province", "city", "address_1", "address_2"] as const

/** Egyptian delivery address from a form → values + field error keys; `address` only when valid. */
export function parseAddress(fd: FormData) {
  const values = Object.fromEntries(ADDRESS.map((k) => [k, str(fd, k)])) as Record<(typeof ADDRESS)[number], string>
  const fieldErrors: Record<string, string> = {}
  for (const k of ["first_name", "last_name", "city", "address_1"] as const) if (!values[k]) fieldErrors[k] = "required"
  if (!GOVERNORATES.some(([c]) => c === values.province)) fieldErrors.province = "governorate"
  const phone = egMobile(values.phone)
  if (!phone) fieldErrors.phone = "phone"
  const address = phone && !Object.keys(fieldErrors).length ? { ...values, phone, country_code: "eg" } : null
  return { values, fieldErrors, address }
}
