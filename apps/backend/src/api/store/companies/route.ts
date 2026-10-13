import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { companySvc, shapeMember } from "../../../lib/company"
import { parse } from "../../../lib/parse"
import { CompanyProfile } from "./validators"

const Create = CompanyProfile.extend({ handle: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional() }).strict()
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company"

// POST /store/companies — signed-in customer without a company creates one and becomes its admin.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(Create, req.body)
  const svc = companySvc(req.scope)
  const customer_id = req.auth_context.actor_id
  if ((await svc.listCompanyMembers({ customer_id })).length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "You already belong to a company.")
  }
  const handle = body.handle ?? slug(body.name)
  if ((await svc.listCompanies({ handle })).length) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Company with handle: ${handle}, already exists.`)
  const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(customer_id)
  const company = await svc.createCompanies({ ...body, handle })
  const member = await svc.createCompanyMembers({
    company_id: company.id, customer_id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name, role: "admin",
  })
  res.status(201).json({ company, member: shapeMember(member) })
}
