import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { orderStatusView, ownParentOr404 } from "../../helpers"

// Customer's per-vendor progress for one of their orders + payment state.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await orderStatusView(req.scope, await ownParentOr404(req)))
}
