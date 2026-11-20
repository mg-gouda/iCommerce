import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parse } from "../../../../lib/parse"
import { salesOrgSvc, shapeRep } from "../../../../lib/sales-org"
import { checkRep, RepBody, RepList, uniqueCode } from "../helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { type, branch_id, q, offset, limit } = parse(RepList, req.query)
  const [rows, count] = await salesOrgSvc(req.scope).listAndCountSalesReps(
    { ...(type && { type }), ...(branch_id && { branch_id }), ...(q && { q }) },
    { order: { type: "ASC", code: "ASC" }, skip: offset, take: limit },
  )
  res.json({ reps: rows.map(shapeRep), count, offset, limit })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(RepBody, req.body)
  await uniqueCode(req.scope, "rep", body.code, body.type)
  const tree = await checkRep(req.scope, body)
  res.status(201).json({ rep: shapeRep(await salesOrgSvc(req.scope).createSalesReps({ ...body, ...tree })) })
}
