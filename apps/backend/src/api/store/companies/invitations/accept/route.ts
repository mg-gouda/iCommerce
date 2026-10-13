import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { companySvc, shapeMember, syncCompanyGroups } from "../../../../../lib/company"
import { parse } from "../../../../../lib/parse"

// Signed-in customer whose email matches the invitation joins the company (and its groups if verified).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { token } = parse(z.object({ token: z.string().min(1) }).strict(), req.body)
  const svc = companySvc(req.scope)
  const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)
  const [inv] = await svc.listCompanyInvitations({ token }, { relations: ["company"] })
  const invalid = !inv || inv.accepted_at || new Date(inv.expires_at) < new Date() || inv.email !== customer.email.toLowerCase()
  if (invalid) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invitation is invalid or expired.")
  if ((await svc.listCompanyMembers({ customer_id: customer.id })).length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "You already belong to a company.")
  }
  const member = await svc.createCompanyMembers({
    company_id: inv.company.id, customer_id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name, role: inv.role,
  })
  await svc.updateCompanyInvitations({ id: inv.id, accepted_at: new Date() })
  await syncCompanyGroups(req.scope, inv.company.id)
  res.json({ company: await svc.retrieveCompany(inv.company.id), member: shapeMember(member) })
}
