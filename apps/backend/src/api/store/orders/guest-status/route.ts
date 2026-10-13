import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { guestKeys, hit, limited } from "../../../../lib/rate-limit"
import { guestParentOr404, orderStatusView } from "../helpers"

// Guest order tracking: ?display_id=&email= → same shape as /store/orders/:id/vendor-orders + `order` basics.
// Only failed lookups count toward the rate limit (the confirmation page re-reads this on every render).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { display_id, email } = req.query
  const keys = guestKeys(req, display_id)
  if (limited(keys)) return void res.status(429).json({ type: "too_many_requests", message: "Too many attempts. Try again later." })
  const parent = await guestParentOr404(req.scope, display_id, email).catch((e) => {
    hit(keys)
    throw e
  })
  res.json({ order: parent.order, ...(await orderStatusView(req.scope, parent)) })
}
