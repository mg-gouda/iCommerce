import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parse } from "../../../../../lib/parse"
import { conflict, salesOrgSvc, shapeRep } from "../../../../../lib/sales-org"
import { checkRep, RepBody, uniqueCode } from "../../helpers"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(RepBody.partial(), req.body)
  const svc = salesOrgSvc(req.scope)
  const cur = await svc.retrieveSalesRep(req.params.id)
  const next = { ...cur, ...body }
  if (body.code || body.type) await uniqueCode(req.scope, "rep", next.code, next.type, cur.id)
  const tree = await checkRep(req.scope, next)
  res.json({ rep: shapeRep(await svc.updateSalesReps({ id: cur.id, ...body, ...tree })) })
}

// Referenced reps can't be deleted (old orders keep their ids) → prefer active: false.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = salesOrgSvc(req.scope)
  const { id } = req.params
  await svc.retrieveSalesRep(id)
  const [, reports] = await svc.listAndCountSalesReps({ manager_id: id }, { take: 1 })
  const [, assignments] = await svc.listAndCountAssignments(
    { $or: [{ branch_manager_id: id }, { account_manager_id: id }, { broker_id: id }] } as never,
    { take: 1 },
  )
  if (reports || assignments) throw conflict(`Rep is used by ${reports} rep(s) and ${assignments} assignment(s). Set active: false instead.`)
  await svc.deleteSalesReps(id)
  res.json({ id, object: "sales_rep", deleted: true })
}
