import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { commissionSvc } from "../../../../lib/commission"
import { parse } from "../../../../lib/parse"
import { checkRule, RuleBody, shapeRule } from "../helpers"

// Edits never touch placed orders: each vendor-order line carries its own commission snapshot.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(RuleBody.partial(), req.body)
  const svc = commissionSvc(req.scope)
  checkRule({ ...(await svc.retrieveCommissionRule(req.params.id)), ...body })
  res.json({ commission_rule: shapeRule(await svc.updateCommissionRules({ id: req.params.id, ...body })) })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = commissionSvc(req.scope)
  await svc.retrieveCommissionRule(req.params.id)
  await svc.deleteCommissionRules(req.params.id)
  res.json({ id: req.params.id, object: "commission_rule", deleted: true })
}
