import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { companySvc } from "../../../lib/company"
import { assertBranch, conflict, repOr404, salesOrgSvc } from "../../../lib/sales-org"
import { REP_TYPES, TARGET_TYPES } from "../../../modules/sales-org/models/sales-org"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"
import { listQuery } from "../../../lib/parse"

const id = z.string().trim().min(1).nullable().optional()
const text = (max: number) => z.string().trim().min(1).max(max)

export const BranchBody = z.object({ code: text(40), name: text(120) }).strict()
export const RepBody = z
  .object({ type: z.enum(REP_TYPES), code: text(40), name: text(120), email: z.string().email().nullable().optional(), branch_id: id, manager_id: id, active: z.boolean().optional() })
  .strict()
export const RepList = z.object({ type: z.enum(REP_TYPES).optional(), branch_id: z.string().optional(), q: z.string().trim().optional(), offset: listQuery.offset, limit: z.coerce.number().int().min(1).max(500).default(100) })
export const AssignmentBody = z
  .object({ target_type: z.enum(TARGET_TYPES), target_id: text(100), branch_id: id, branch_manager_id: id, account_manager_id: id, broker_id: id })
  .strict()

/** Rep tree rules: manager is a branch manager; an account manager / broker without a branch takes its manager's. */
export async function checkRep(scope: MedusaContainer, r: { type: string; branch_id?: string | null; manager_id?: string | null }) {
  const out = { branch_id: r.branch_id ?? null, manager_id: r.manager_id ?? null }
  if (out.manager_id) {
    if (r.type === "branch_manager") throw new MedusaError(MedusaError.Types.INVALID_DATA, "A branch manager has no manager.")
    out.branch_id ??= (await repOr404(scope, out.manager_id, "branch_manager")).branch_id ?? null
  }
  await assertBranch(scope, out.branch_id)
  return out
}

export async function uniqueCode(scope: MedusaContainer, entity: "branch" | "rep", code: string, type?: string, self?: string) {
  const svc = salesOrgSvc(scope)
  const hit = entity === "branch" ? await svc.listBranches({ code }) : await svc.listSalesReps({ code, type: type as never })
  if (hit.some((x) => x.id !== self)) throw conflict(`Code "${code}" is already used.`)
}

/** 404 when the assignment's target doesn't exist. */
export async function assertTarget(scope: MedusaContainer, type: (typeof TARGET_TYPES)[number], target_id: string) {
  if (type === "company") await companySvc(scope).retrieveCompany(target_id, { select: ["id"] })
  if (type === "customer") await scope.resolve(Modules.CUSTOMER).retrieveCustomer(target_id, { select: ["id"] })
  if (type === "vendor") await scope.resolve<VendorModuleService>(VENDOR_MODULE).retrieveVendor(target_id, { select: ["id"] })
}
