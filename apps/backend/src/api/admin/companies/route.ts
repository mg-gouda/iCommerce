import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { companySvc, shapeMember } from "../../../lib/company"
import { listQuery, parse } from "../../../lib/parse"

const List = z.object({ q: z.string().trim().optional(), kyc_status: z.enum(["none", "submitted", "verified", "rejected"]).optional(), ...listQuery })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { q, kyc_status, limit, offset } = parse(List, req.query)
  const [companies, count] = await companySvc(req.scope).listAndCountCompanies(
    { ...(q && { q }), ...(kyc_status && { kyc_status }) },
    { relations: ["members"], order: { created_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ companies: companies.map((c) => ({ ...c, members: c.members.map(shapeMember) })), count, limit, offset })
}
