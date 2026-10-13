import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { BANK_PROVIDER } from "../../../../../modules/offline-payment/service"
import { ownParentOr404, saveProof } from "../../helpers"

// multipart: `file`. Own bank-transfer orders not yet confirmed.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parent = await ownParentOr404(req)
  const p = parent.payment
  if (p?.provider_id !== BANK_PROVIDER) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order is not paid by bank transfer.")
  if (p.captured_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Payment already confirmed.")
  res.json({ payment_proof: await saveProof(req, parent.id) })
}
