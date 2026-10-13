import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { callerMembership, companySvc, shapeInvitation, shapeMember } from "../../../../../lib/company"

// Members for everyone in the company; open invitations for admins only.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company, member } = await callerMembership(req)
  const svc = companySvc(req.scope)
  const members = await svc.listCompanyMembers({ company_id: company.id } as never, { order: { created_at: "ASC" } })
  const invitations =
    member.role === "admin"
      ? (await svc.listCompanyInvitations({ company_id: company.id, accepted_at: null, expires_at: { $gt: new Date() } } as never)).map(shapeInvitation)
      : []
  res.json({ members: members.map(shapeMember), invitations })
}
