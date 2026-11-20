import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { listQuery, parse } from "../../../../lib/parse"
import { deriveAttribution, salesOrgSvc, shapeAssignment } from "../../../../lib/sales-org"
import { TARGET_TYPES } from "../../../../modules/sales-org/models/sales-org"
import { AssignmentBody, assertTarget } from "../helpers"

const List = z.object({ target_type: z.enum(TARGET_TYPES).optional(), target_id: z.string().optional(), ...listQuery })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { target_type, target_id, offset, limit } = parse(List, req.query)
  const [rows, count] = await salesOrgSvc(req.scope).listAndCountAssignments(
    { ...(target_type && { target_type }), ...(target_id && { target_id }) },
    { order: { updated_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ assignments: rows.map(shapeAssignment), count, offset, limit })
}

// Upsert by (target_type, target_id). Missing tree fields are derived now and stored.
export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { target_type, target_id, ...ids } = parse(AssignmentBody, req.body)
  await assertTarget(req.scope, target_type, target_id)
  const attr = await deriveAttribution(req.scope, ids)
  const svc = salesOrgSvc(req.scope)
  const [cur] = await svc.listAssignments({ target_type, target_id })
  const row = cur ? await svc.updateAssignments({ id: cur.id, ...attr }) : await svc.createAssignments({ target_type, target_id, ...attr })
  res.json({ assignment: shapeAssignment(row) })
}
