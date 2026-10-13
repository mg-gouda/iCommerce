import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { callerMembership, companySvc, requireRole, shapeMember } from "../../../../lib/company"
import { parse } from "../../../../lib/parse"
import { CompanyProfile } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company, member } = await callerMembership(req)
  res.json({ company, member: shapeMember(member) })
}

// Admin edits the profile (KYC numbers go through /kyc, status/payment mode through admin).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company, member } = await callerMembership(req)
  requireRole(member, ["admin"])
  const body = parse(CompanyProfile.partial().strict(), req.body)
  const updated = await companySvc(req.scope).updateCompanies({ id: company.id, ...body })
  res.json({ company: updated, member: shapeMember(member) })
}
