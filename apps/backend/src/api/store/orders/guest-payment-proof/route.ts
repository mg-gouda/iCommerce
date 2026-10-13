import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { guestKeys, hit, limited } from "../../../../lib/rate-limit"
import { awaitingTransfer, guestParentOr404, saveProof } from "../helpers"

// Guest bank-transfer receipt. multipart: `file` + `display_id` + `email`. Every attempt counts toward the rate limit.
export async function POST(req: MedusaRequest<{ display_id?: string; email?: string }>, res: MedusaResponse) {
  const { display_id, email } = req.body ?? {}
  const keys = guestKeys(req, display_id)
  if (limited(keys)) return void res.status(429).json({ type: "too_many_requests", message: "Too many attempts. Try again later." })
  hit(keys)
  const parent = await guestParentOr404(req.scope, display_id, email)
  // Not bank transfer / already confirmed → same 404 as a wrong number or email.
  if (!awaitingTransfer(parent.payment)) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  res.json({ payment_proof: await saveProof(req, parent.id) })
}
