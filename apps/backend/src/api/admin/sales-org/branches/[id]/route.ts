import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parse } from "../../../../../lib/parse"
import { conflict, salesOrgSvc, shapeBranch } from "../../../../../lib/sales-org"
import { BranchBody, uniqueCode } from "../../helpers"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(BranchBody.partial(), req.body)
  const svc = salesOrgSvc(req.scope)
  await svc.retrieveBranch(req.params.id)
  if (body.code) await uniqueCode(req.scope, "branch", body.code, undefined, req.params.id)
  res.json({ branch: shapeBranch(await svc.updateBranches({ id: req.params.id, ...body })) })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = salesOrgSvc(req.scope)
  const { id } = req.params
  await svc.retrieveBranch(id)
  const [, reps] = await svc.listAndCountSalesReps({ branch_id: id }, { take: 1 })
  const [, assignments] = await svc.listAndCountAssignments({ branch_id: id }, { take: 1 })
  if (reps || assignments) throw conflict(`Branch is used by ${reps} rep(s) and ${assignments} assignment(s).`)
  await svc.deleteBranches(id)
  res.json({ id, object: "sales_branch", deleted: true })
}
