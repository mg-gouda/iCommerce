"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "@/i18n/navigation"
import { api, ApiError, routeLocale } from "./api"

/** Upgrade request → backend stores it + notifies iCommerce. Billing stays manual (admin marks paid). */
export async function requestUpgrade(fd: FormData) {
  const locale = routeLocale(fd)
  let error = ""
  try {
    await api("/vendors/plan/upgrade-request", { method: "POST", body: JSON.stringify({ plan_id: String(fd.get("plan_id") ?? "") }) })
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    error = e.status === 401 ? "expired" : e.message
  }
  revalidatePath("/[locale]/dashboard/plan", "page")
  redirect({ href: error ? `/dashboard/plan?error=${encodeURIComponent(error)}` : "/dashboard/plan?requested=1", locale })
}
