"use server"

import { revalidatePath } from "next/cache"
import { api, ApiError, filesOf, uploadImages } from "./api"
import type { FormState } from "./types"

const MB = 1024 * 1024
const IMAGE = /^image\/(png|jpeg|webp|gif)$/
const KYC_TYPE = /^(application\/pdf|image\/(png|jpeg|webp))$/
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim()

const fail = (e: unknown, values: Record<string, string>): FormState => {
  if (e instanceof ApiError) return { values, message: e.status === 401 ? "expired" : e.message }
  throw e
}

export async function saveProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = Object.fromEntries(["name", "description", "phone", "email", "country", "city"].map((k) => [k, str(fd, k)]))
  const fieldErrors: Record<string, string> = {}
  if (!values.name) fieldErrors.name = "companyRequired"
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fieldErrors.email = "email"
  if (values.phone && !/^\+?[0-9 ()-]{7,20}$/.test(values.phone)) fieldErrors.phone = "phone"
  const [logo, banner] = [filesOf(fd, "logo"), filesOf(fd, "banner")]
  for (const [k, f] of [["logo", logo[0]], ["banner", banner[0]]] as const) {
    if (f && !IMAGE.test(f.type)) fieldErrors[k] = "imageType"
    else if (f && f.size > 5 * MB) fieldErrors[k] = "imageSize"
  }
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }
  try {
    const [logoUrl] = await uploadImages(logo)
    const [bannerUrl] = await uploadImages(banner)
    await api("/vendors/me", {
      method: "POST",
      body: JSON.stringify({
        name: values.name,
        description: values.description || null,
        phone: values.phone || null,
        email: values.email || null,
        country: values.country || null,
        city: values.city || null,
        ...(logoUrl && { logo: logoUrl }),
        ...(bannerUrl && { banner: bannerUrl }),
      }),
    })
  } catch (e) {
    return fail(e, values)
  }
  revalidatePath("/[locale]/dashboard", "layout")
  return { ok: true, values }
}

export async function submitKyc(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = Object.fromEntries(["tax_id", "commercial_reg_no", "export_card_no"].map((k) => [k, str(fd, k)]))
  const files = filesOf(fd, "files")
  const fieldErrors: Record<string, string> = {}
  if (!/^\d{9}$/.test(values.tax_id.replace(/[\s-]/g, ""))) fieldErrors.tax_id = "taxId"
  if (!/^\d{1,12}$/.test(values.commercial_reg_no)) fieldErrors.commercial_reg_no = "crNo"
  if (!/^[A-Za-z0-9/-]{3,20}$/.test(values.export_card_no)) fieldErrors.export_card_no = "exportCard"
  if (!files.length) fieldErrors.files = "kycFilesRequired"
  else if (files.length > 10) fieldErrors.files = "kycFilesMax"
  else if (files.some((f) => !KYC_TYPE.test(f.type))) fieldErrors.files = "kycFileType"
  else if (files.some((f) => f.size > 10 * MB)) fieldErrors.files = "kycFileSize"
  if (Object.keys(fieldErrors).length) return { values, fieldErrors }

  const body = new FormData()
  Object.entries(values).forEach(([k, v]) => body.append(k, v))
  files.forEach((f) => body.append("files", f))
  try {
    await api("/vendors/me/kyc", { method: "POST", body })
  } catch (e) {
    return fail(e, values)
  }
  revalidatePath("/[locale]/dashboard", "layout")
  return { ok: true, values }
}
