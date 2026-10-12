import { cookies } from "next/headers"
import { getLocale } from "next-intl/server"
import { redirect } from "@/i18n/navigation"
import type { Vendor, VendorUser } from "./types"

// Server-only: the vendor JWT lives in an httpOnly cookie and never reaches the browser.
export const BACKEND = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
export const TOKEN_COOKIE = "vendor_token"

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Raw call; `token` overrides the cookie (used during sign-up before the cookie exists). */
export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const token = init.token ?? (await cookies()).get(TOKEN_COOKIE)?.value
  const isForm = init.body instanceof FormData
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(isForm || !init.body ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.message ?? res.statusText)
  return data as T
}

/** Server components only: an expired/missing session sends the user to /login. Server actions use api() (no root params there). */
export async function vendorApi<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await api<T>(path, init)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect({ href: "/login?expired=1", locale: await getLocale() })
    throw e
  }
}

export const getMe = () => vendorApi<{ vendor: Vendor; user: VendorUser }>("/vendors/me")

/** Uploads public images; returns their URLs in input order. */
export async function uploadImages(files: File[]) {
  if (!files.length) return []
  const form = new FormData()
  files.forEach((f) => form.append("files", f))
  const { files: out } = await api<{ files: { url: string }[] }>("/vendors/uploads", { method: "POST", body: form })
  return out.map((f) => f.url)
}

export const routeLocale = (fd: FormData) => (fd.get("locale") === "ar" ? "ar" : "en")

/** Non-empty files from a multipart field (browsers send one empty File when nothing is picked). */
export const filesOf = (fd: FormData, name: string) =>
  fd.getAll(name).filter((f): f is File => f instanceof File && f.size > 0)

/** Public category list (store API, publishable key) for the product form. */
export async function getCategories() {
  const res = await fetch(`${BACKEND}/store/product-categories?limit=200&fields=id,name`, {
    headers: { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "" },
    cache: "no-store",
  })
  if (!res.ok) return []
  return ((await res.json()).product_categories ?? []) as { id: string; name: string }[]
}
