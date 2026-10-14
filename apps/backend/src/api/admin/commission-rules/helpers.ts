import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { money } from "../../../lib/parse"
import { planSvc } from "../../../lib/plans"
import { COMMISSION_SCOPES } from "../../../modules/commission/models/commission-rule"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => (v == null ? null : Number(v))

export const RuleBody = z
  .object({
    scope: z.enum(COMMISSION_SCOPES),
    scope_id: z.string().trim().min(1).nullable().optional(),
    channel: z.enum(["b2c", "b2b", "all"]),
    percent: z.number().min(0).max(100),
    fixed_amount: money.optional(),
    min: money.nullable().optional(),
    max: money.nullable().optional(),
    active_from: z.coerce.date().nullable().optional(),
    active_to: z.coerce.date().nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .strict()

export function checkRule(r: Row) {
  const fail = (m: string) => {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, m)
  }
  if (r.scope === "global" && r.scope_id) fail("global rules have no scope_id.")
  if (r.scope !== "global" && !r.scope_id) fail(`scope_id is required for ${r.scope} rules.`)
  if (r.scope === "vendor_category" && !/^[^:]+:[^:]+$/.test(r.scope_id)) fail("vendor_category scope_id must be <vendor_id>:<category_id>.")
  if (r.min != null && r.max != null && Number(r.min) > Number(r.max)) fail("min must be ≤ max.")
  if (r.active_from && r.active_to && new Date(r.active_from) >= new Date(r.active_to)) fail("active_from must be before active_to.")
}

export const shapeRule = (r: Row) => ({
  id: r.id, scope: r.scope, scope_id: r.scope_id, channel: r.channel, percent: Number(r.percent), fixed_amount: Number(r.fixed_amount),
  min: n(r.min), max: n(r.max), active_from: r.active_from, active_to: r.active_to, note: r.note, created_at: r.created_at, updated_at: r.updated_at,
})

/** Human label for scope_id (vendor / category / plan names). */
export async function scopeLabels(scope: MedusaContainer, rules: Row[]) {
  const ids = rules.flatMap((r) => (r.scope_id ? String(r.scope_id).split(":") : []))
  const [vendors, cats, plans] = ids.length
    ? await Promise.all([
        (scope.resolve(VENDOR_MODULE) as VendorModuleService).listVendors({ id: ids }, { select: ["id", "name"] }),
        scope.resolve(Modules.PRODUCT).listProductCategories({ id: ids }, { select: ["id", "name"] }),
        planSvc(scope).listPlans({ id: ids }),
      ])
    : [[], [], []]
  const name = new Map<string, string>([...vendors.map((v) => [v.id, v.name]), ...cats.map((c) => [c.id, c.name]), ...plans.map((p) => [p.id, p.name_en])] as [string, string][])
  return (r: Row) => (r.scope_id ? String(r.scope_id).split(":").map((id) => name.get(id) ?? id).join(" · ") : "All vendors")
}
