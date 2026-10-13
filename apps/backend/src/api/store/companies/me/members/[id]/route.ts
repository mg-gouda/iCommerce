import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { callerMembership, companySvc, requireRole, shapeMember, syncCompanyGroups } from "../../../../../../lib/company"
import { parse } from "../../../../../../lib/parse"
import { Role } from "../../../validators"

// Admin only. Target must be in the caller's company (else 404); the last admin can't be demoted or removed.
async function target(req: AuthenticatedMedusaRequest) {
  const { company, member } = await callerMembership(req)
  requireRole(member, ["admin"])
  const svc = companySvc(req.scope)
  const [m] = await svc.listCompanyMembers({ id: req.params.id, company_id: company.id } as never)
  if (!m) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Member with id "${req.params.id}" not found`)
  const admins = await svc.listCompanyMembers({ company_id: company.id, role: "admin" } as never)
  const lastAdmin = m.role === "admin" && admins.length === 1
  return { company, m, lastAdmin, svc }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { role } = parse(z.object({ role: Role }).strict(), req.body)
  const { m, lastAdmin, svc } = await target(req)
  if (lastAdmin && role !== "admin") throw new MedusaError(MedusaError.Types.INVALID_DATA, "A company needs at least one admin.")
  res.json({ member: shapeMember(await svc.updateCompanyMembers({ id: m.id, role })) })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company, m, lastAdmin, svc } = await target(req)
  if (lastAdmin) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A company needs at least one admin.")
  await svc.deleteCompanyMembers(m.id)
  await syncCompanyGroups(req.scope, company.id, [m.customer_id])
  res.json({ id: m.id, object: "company_member", deleted: true })
}
