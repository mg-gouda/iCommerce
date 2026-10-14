import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { commissionSvc } from "../../../lib/commission"
import { parse } from "../../../lib/parse"
import { checkRule, RuleBody, scopeLabels, shapeRule } from "./helpers"

const ORDER = ["vendor_category", "vendor", "category", "plan", "global"]

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const scope = req.query.scope as string | undefined
  const rules = await commissionSvc(req.scope).listCommissionRules(scope ? { scope: scope as never } : {})
  rules.sort((a, b) => ORDER.indexOf(a.scope) - ORDER.indexOf(b.scope) || +new Date(b.created_at) - +new Date(a.created_at))
  const label = await scopeLabels(req.scope, rules)
  res.json({ commission_rules: rules.map((r) => ({ ...shapeRule(r), scope_label: label(r) })) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(RuleBody, req.body)
  checkRule(body)
  res.status(201).json({ commission_rule: shapeRule(await commissionSvc(req.scope).createCommissionRules(body)) })
}
