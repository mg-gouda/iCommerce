import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { callerMembership } from "../../../../../lib/company"
import { creditSummary, shapeAccount, shapeInvoice } from "../../../../../lib/net-terms"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company } = await callerMembership(req)
  const c = await creditSummary(req.scope, company.id)
  res.json({ credit_account: c.account ? shapeAccount(c.account) : null, used: c.used, available: c.available, invoices: c.invoices.map(shapeInvoice) })
}
