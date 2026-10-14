import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import VendorProductLink from "../links/vendor-product"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { VENDOR_PLAN_MODULE } from "../modules/vendor-plan"
import type VendorPlanModuleService from "../modules/vendor-plan/service"
import { sendEmail } from "./emails"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86_400_000
export const graceDays = () => Number(process.env.PLAN_GRACE_DAYS ?? 7)
export const planSvc = (scope: MedusaContainer): VendorPlanModuleService => scope.resolve(VENDOR_PLAN_MODULE)

export const shapePlan = (p: Row) => ({
  id: p.id, handle: p.handle, name_en: p.name_en, name_ar: p.name_ar, price_usd: Number(p.price_usd), interval: p.interval,
  product_limit: p.product_limit, staff_limit: p.staff_limit, featured_slots: p.featured_slots, can_b2b: p.can_b2b,
  analytics_level: p.analytics_level, active: p.active,
})

/** past_due longer than the grace period → products hidden, product editing read-only. */
export const isReadOnly = (s: Row | null | undefined, now = new Date()) =>
  s?.status === "past_due" && !!s.current_period_end && +new Date(s.current_period_end) + graceDays() * DAY < +now

export const shapeSubscription = (s: Row, now = new Date()) => ({
  id: s.id ?? null, vendor_id: s.vendor_id, plan_id: s.plan_id ?? s.plan?.id ?? null, plan: s.plan ? shapePlan(s.plan) : null,
  status: s.status, current_period_start: s.current_period_start ?? null, current_period_end: s.current_period_end ?? null,
  requested_plan_id: s.requested_plan_id ?? null, read_only: isReadOnly(s, now),
})

/**
 * Vendor's effective subscription. No row (new vendors) or cancelled → Starter, active (ponytail: no row is created).
 * No plans seeded at all → plan null = no limits.
 */
export async function vendorPlanState(scope: MedusaContainer, vendor_id: string, now = new Date()) {
  const svc = planSvc(scope)
  const [sub] = await svc.listVendorSubscriptions({ vendor_id }, { relations: ["plan"] })
  if (sub && sub.status !== "cancelled") return shapeSubscription(sub, now)
  const [starter] = await svc.listPlans({ handle: "starter" })
  return shapeSubscription({ ...(sub ?? {}), vendor_id, status: "active", plan: starter ?? null, current_period_start: null, current_period_end: null }, now)
}

/** vendor_id → plan id (for commission `plan` scope). */
export async function planIdsFor(scope: MedusaContainer, vendor_ids: string[]) {
  const svc = planSvc(scope)
  const subs = vendor_ids.length ? await svc.listVendorSubscriptions({ vendor_id: vendor_ids }, { relations: ["plan"] }) : []
  const [starter] = await svc.listPlans({ handle: "starter" })
  const by = new Map(subs.filter((s) => s.status !== "cancelled").map((s) => [s.vendor_id, s.plan.id]))
  return new Map(vendor_ids.map((v) => [v, by.get(v) ?? starter?.id ?? null]))
}

export async function hiddenVendorIds(scope: MedusaContainer, now = new Date()) {
  const subs = await planSvc(scope).listVendorSubscriptions({ status: "past_due", current_period_end: { $lt: new Date(+now - graceDays() * DAY) } })
  return subs.map((s) => s.vendor_id)
}

export async function productIdsOf(scope: MedusaContainer, vendor_ids: string[]) {
  if (!vendor_ids.length) return []
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: VendorProductLink.entryPoint, fields: ["product_id"], filters: { vendor_id: vendor_ids },
  })
  return (data as Row[]).map((l) => l.product_id as string)
}

/** Storefront hiding: products of read-only (past_due beyond grace) vendors. */
export const hiddenProductIds = async (scope: MedusaContainer) => productIdsOf(scope, await hiddenVendorIds(scope))

const limitMsg = (name: string, n: number) => `Plan limit reached: ${name} allows ${n} products. Upgrade your plan to add more.`

/** How many more products the vendor may create (Infinity = unlimited). */
export async function productsLeft(scope: MedusaContainer, vendor_id: string) {
  const { plan } = await vendorPlanState(scope, vendor_id)
  if (plan?.product_limit == null) return { left: Infinity, message: "" }
  const used = (await productIdsOf(scope, [vendor_id])).length
  return { left: Math.max(0, plan.product_limit - used), message: limitMsg(plan.name_en, plan.product_limit) }
}

export async function assertProductLimit(scope: MedusaContainer, vendor_id: string) {
  const { left, message } = await productsLeft(scope, vendor_id)
  if (left < 1) throw new MedusaError(MedusaError.Types.INVALID_DATA, message)
}

export const vendorCanB2b = async (scope: MedusaContainer, vendor_id: string) => (await vendorPlanState(scope, vendor_id)).plan?.can_b2b ?? true

export async function assertCanB2b(scope: MedusaContainer, vendor_id: string) {
  if (!(await vendorCanB2b(scope, vendor_id))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Your plan does not include B2B (wholesale tiers, quotes). Upgrade your plan.")
  }
}

export async function assertWritable(scope: MedusaContainer, vendor_id: string) {
  if ((await vendorPlanState(scope, vendor_id)).read_only) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Your plan is past due. Product editing is read-only until payment.")
  }
}

/** Next period after a payment: from max(now, period end) (now when trial/past_due) + one interval. */
export function nextPeriod(s: Row, interval: string, now = new Date()) {
  const end = s.current_period_end ? new Date(s.current_period_end) : null
  const start = s.status === "active" && end && end > now ? end : now
  const next = new Date(start)
  if (interval === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 1)
  return { current_period_start: start, current_period_end: next }
}

async function ownerOf(scope: MedusaContainer, vendor_id: string) {
  const v = await (scope.resolve(VENDOR_MODULE) as VendorModuleService).retrieveVendor(vendor_id, { relations: ["users"] })
  return { vendor: v, email: v.users?.find((u) => u.role === "owner")?.email ?? v.email }
}

/** Daily: trial/active on a paid plan past period end → past_due + email (EN/AR) to the vendor owner. */
export async function flagPastDue(scope: MedusaContainer, now = new Date()) {
  const svc = planSvc(scope)
  const due = (await svc.listVendorSubscriptions({ status: ["trial", "active"], current_period_end: { $lt: now } }, { relations: ["plan"] }))
    .filter((s) => Number(s.plan.price_usd) > 0)
  if (due.length) await svc.updateVendorSubscriptions(due.map((s) => ({ id: s.id, status: "past_due" as const })))
  for (const s of due) {
    const { vendor, email } = await ownerOf(scope, s.vendor_id)
    const grace = new Date(+new Date(s.current_period_end!) + graceDays() * DAY).toISOString().slice(0, 10)
    for (const locale of ["en", "ar"]) {
      // Vendors have no locale yet → both languages.
      await sendEmail(scope, {
        to: email, template: "plan-past-due", locale,
        data: { display_id: "", currency_code: "usd", total: Number(s.plan.price_usd), vendor_name: vendor.name, due_date: grace, plan_name: locale === "ar" ? s.plan.name_ar : s.plan.name_en },
        key: `plan-past-due-${s.id}-${new Date(s.current_period_end!).toISOString().slice(0, 10)}-${locale}`,
      })
    }
  }
  return due.length
}

/** Admin feed (bell) + optional ADMIN_NOTIFY_EMAIL. */
export async function notifyAdmins(scope: MedusaContainer, title: string, description: string) {
  const n = scope.resolve(Modules.NOTIFICATION)
  try {
    await n.createNotifications({ to: "", channel: "feed", template: "admin-ui", data: { title, description } })
    if (process.env.ADMIN_NOTIFY_EMAIL) {
      await n.createNotifications({ to: process.env.ADMIN_NOTIFY_EMAIL, channel: "email", template: "admin-notice", content: { subject: title, html: `<p>${description.replace(/[&<>]/g, "")}</p>` } })
    }
  } catch (e) {
    scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`admin notification failed: ${(e as Error).message}`)
  }
}
