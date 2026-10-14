import type { MedusaContainer } from "@medusajs/framework/types"
import { COMMISSION_MODULE } from "../modules/commission"
import type CommissionModuleService from "../modules/commission/service"
import type { Channel } from "./fees"
import { activeAt, major, rateCents } from "./money"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const commissionSvc = (scope: MedusaContainer): CommissionModuleService => scope.resolve(COMMISSION_MODULE)

export type LineCtx = { vendor_id: string; plan_id?: string | null; category_ids: string[]; channel: Channel; at?: Date }

/** Most specific wins: vendor_category → vendor → category → plan → global; exact channel beats `all`, then newest. */
export function resolveRule(rules: Row[], c: LineCtx) {
  const at = c.at ?? new Date()
  const levels: [string, (r: Row) => boolean][] = [
    ["vendor_category", (r) => c.category_ids.some((cat) => r.scope_id === `${c.vendor_id}:${cat}`)],
    ["vendor", (r) => r.scope_id === c.vendor_id],
    ["category", (r) => c.category_ids.includes(r.scope_id)],
    ["plan", (r) => !!c.plan_id && r.scope_id === c.plan_id],
    ["global", () => true],
  ]
  for (const [scope, match] of levels) {
    const hit = rules
      .filter((r) => r.scope === scope && (r.channel === c.channel || r.channel === "all") && activeAt(r, at) && match(r))
      .sort((a, b) => Number(b.channel === c.channel) - Number(a.channel === c.channel) || +new Date(b.created_at) - +new Date(a.created_at))[0]
    if (hit) return hit
  }
  return null
}

/** Snapshot stored on each vendor-order line (metadata.commission). */
export function commissionFor(rule: Row | null, lineCents: number) {
  if (!rule) return { rule_id: null, scope: null, percent: 0, fixed_amount: 0, min: null, max: null, amount: 0 }
  return {
    rule_id: rule.id as string, scope: rule.scope as string, percent: Number(rule.percent), fixed_amount: Number(rule.fixed_amount),
    min: rule.min == null ? null : Number(rule.min), max: rule.max == null ? null : Number(rule.max),
    amount: major(rateCents(lineCents, rule.percent, rule.fixed_amount, rule.min, rule.max)),
  }
}
export type CommissionSnapshot = ReturnType<typeof commissionFor>
