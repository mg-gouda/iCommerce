import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { salesOrgSvc } from "../../../../../lib/sales-org"

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = salesOrgSvc(req.scope)
  await svc.retrieveAssignment(req.params.id)
  await svc.deleteAssignments(req.params.id)
  res.json({ id: req.params.id, object: "sales_assignment", deleted: true })
}
