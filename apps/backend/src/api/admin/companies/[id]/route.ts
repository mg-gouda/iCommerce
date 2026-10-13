import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { companySvc, shapeMember } from "../../../../lib/company"
import { shapeAccount } from "../../../../lib/net-terms"
import { parse } from "../../../../lib/parse"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = companySvc(req.scope)
  const c = await svc.retrieveCompany(req.params.id, { relations: ["members"] })
  const [account] = await svc.listCreditAccounts({ company_id: c.id })
  res.json({ company: { ...c, members: c.members.map(shapeMember), credit_account: account ? shapeAccount(account) : null } })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(z.object({ payment_mode: z.enum(["upfront", "net_terms"]) }).strict(), req.body)
  const svc = companySvc(req.scope)
  await svc.retrieveCompany(req.params.id) // 404
  res.json({ company: await svc.updateCompanies({ id: req.params.id, ...body }) })
}
