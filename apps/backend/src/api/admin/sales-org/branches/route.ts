import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { parse } from "../../../../lib/parse"
import { salesOrgSvc, shapeBranch } from "../../../../lib/sales-org"
import { BranchBody, uniqueCode } from "../helpers"

const List = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100) })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { offset, limit } = parse(List, req.query)
  const [rows, count] = await salesOrgSvc(req.scope).listAndCountBranches({}, { order: { code: "ASC" }, skip: offset, take: limit })
  res.json({ branches: rows.map(shapeBranch), count, offset, limit })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(BranchBody, req.body)
  await uniqueCode(req.scope, "branch", body.code)
  res.status(201).json({ branch: shapeBranch(await salesOrgSvc(req.scope).createBranches(body)) })
}
