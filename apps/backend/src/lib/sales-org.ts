import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { SALES_ORG_MODULE } from "../modules/sales-org"
import type SalesOrgModuleService from "../modules/sales-org/service"
import { companySvc } from "./company"
import { patchOrderMetadata } from "./vendor-orders"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const salesOrgSvc = (scope: MedusaContainer): SalesOrgModuleService => scope.resolve(SALES_ORG_MODULE)
export const ATTR_KEYS = ["branch_id", "branch_manager_id", "account_manager_id", "broker_id"] as const
export type Attribution = Record<(typeof ATTR_KEYS)[number], string | null>
type RepKey = Exclude<(typeof ATTR_KEYS)[number], "branch_id">
const REP_OF: Record<RepKey, string> = { branch_manager_id: "branch_manager", account_manager_id: "account_manager", broker_id: "broker" }

const notFound = (what: string, id: string) => new MedusaError(MedusaError.Types.NOT_FOUND, `${what} with id "${id}" not found`)
export const conflict = (msg: string) => new MedusaError(MedusaError.Types.CONFLICT, msg)

export const shapeBranch = (b: Row) => ({ id: b.id, code: b.code, name: b.name, legacy_id: b.legacy_id ?? null, created_at: b.created_at })
export const shapeRep = (r: Row) => ({
  id: r.id, type: r.type, code: r.code, name: r.name, email: r.email ?? null, branch_id: r.branch_id ?? null, manager_id: r.manager_id ?? null,
  legacy_id: r.legacy_id ?? null, active: r.active, created_at: r.created_at,
})
export const shapeAssignment = (a: Row) => ({
  id: a.id, target_type: a.target_type, target_id: a.target_id, ...Object.fromEntries(ATTR_KEYS.map((k) => [k, a[k] ?? null])), updated_at: a.updated_at,
})

export async function assertBranch(scope: MedusaContainer, id?: string | null) {
  if (id && !(await salesOrgSvc(scope).listBranches({ id }, { select: ["id"] })).length) throw notFound("Branch", id)
}
/** Rep by id; 404 when missing or of another type. */
export async function repOr404(scope: MedusaContainer, id: string, type?: string) {
  const [r] = await salesOrgSvc(scope).listSalesReps({ id })
  if (!r || (type && r.type !== type)) throw notFound(type ? type.replace("_", " ") : "Sales rep", id)
  return r as Row
}

/** Fills the tree at write time: broker / account manager → its branch manager → that manager's branch. Ids are validated (404). */
export async function deriveAttribution(scope: MedusaContainer, input: Partial<Attribution>): Promise<Attribution> {
  const out: Attribution = { branch_id: null, branch_manager_id: null, account_manager_id: null, broker_id: null, ...input }
  for (const k of ["broker_id", "account_manager_id"] as const) {
    if (!out[k]) continue
    const r = await repOr404(scope, out[k]!, REP_OF[k])
    out.branch_manager_id ??= r.manager_id ?? null
  }
  if (out.branch_manager_id) out.branch_id ??= (await repOr404(scope, out.branch_manager_id, "branch_manager")).branch_id ?? null
  await assertBranch(scope, out.branch_id)
  return out
}

/** Copies the attribution onto the parent + every child order once (placement time; later reassignment never rewrites). */
export async function attributeOrder(scope: MedusaContainer, parent: { id: string; customer_id?: string | null; metadata?: Row | null }) {
  if (parent.metadata?.sales_attribution) return
  const sales_attribution = await attributionFor(scope, parent.customer_id)
  if (!sales_attribution) return
  for (const id of [parent.id, ...((parent.metadata?.vendor_order_ids ?? []) as string[])]) await patchOrderMetadata(scope, id, { sales_attribution })
}

/** Order attribution: the customer's company assignment, else the customer's own, else null. */
export async function attributionFor(scope: MedusaContainer, customer_id?: string | null) {
  if (!customer_id) return null
  const [member] = await companySvc(scope).listCompanyMembers({ customer_id }, { relations: ["company"] })
  const svc = salesOrgSvc(scope)
  const targets = [...(member ? [["company", (member as Row).company.id]] : []), ["customer", customer_id]] as const
  for (const [target_type, target_id] of targets) {
    const [a] = await svc.listAssignments({ target_type, target_id })
    if (a) return { ...(Object.fromEntries(ATTR_KEYS.map((k) => [k, (a as Row)[k] ?? null])) as Attribution), source: target_type }
  }
  return null
}
