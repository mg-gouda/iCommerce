import { randomBytes } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { callerMembership, companySvc, customerLocale, requireRole, shapeInvitation } from "../../../../../lib/company"
import { sendEmail } from "../../../../../lib/emails"
import { parse } from "../../../../../lib/parse"
import { Role } from "../../validators"

const DAYS = 14

// Admin invites by email; the token only travels in the email link.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { email, role } = parse(z.object({ email: z.string().trim().toLowerCase().email(), role: Role }).strict(), req.body)
  const { company, member } = await callerMembership(req)
  requireRole(member, ["admin"])
  const svc = companySvc(req.scope)
  if ((await svc.listCompanyMembers({ company_id: company.id, email } as never)).length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${email} is already a member.`)
  }
  const token = randomBytes(24).toString("base64url")
  const invitation = await svc.createCompanyInvitations({
    company_id: company.id, email, role, token, expires_at: new Date(Date.now() + DAYS * 86_400_000),
  })
  const locale = (await customerLocale(req.scope, member.customer_id)) === "ar" ? "ar" : "en"
  const base = process.env.STOREFRONT_URL ?? "http://localhost:3000"
  await sendEmail(req.scope, {
    to: email,
    template: "company-invite",
    locale,
    data: { display_id: "", currency_code: "usd", company_name: company.name, url: `${base}/${locale}/account/company/join?token=${token}` },
    key: `company-invite-${invitation.id}`,
  })
  res.status(201).json({ invitation: shapeInvitation(invitation) })
}
