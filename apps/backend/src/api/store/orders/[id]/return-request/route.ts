import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { patchOrderMetadata } from "../../../../../lib/vendor-orders"
import { PostReturnRequest } from "../../../../vendors/orders/validators"
import { childOrders, ownParentOr404 } from "../../helpers"

// Customer asks to return delivered items. Items (parent line ids) are routed to their vendor orders;
// the vendor approves/rejects. ponytail: refund is manual (admin), no return shipping / Medusa return flow.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = PostReturnRequest.safeParse(req.body)
  if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, body.error.message)
  const parent = await ownParentOr404(req)
  const children = await childOrders(req, parent)
  const bad = (msg: string) => new MedusaError(MedusaError.Types.INVALID_DATA, msg)

  const byChild = new Map<string, { item_id: string; quantity: number }[]>()
  for (const { item_id, quantity } of body.data.items) {
    const child = children.find((c) => c.items.some((i) => i.parent_item_id === item_id))
    const item = child?.items.find((i) => i.parent_item_id === item_id)
    if (!child || !item) throw bad(`Unknown item ${item_id}.`)
    if (child.status !== "delivered") throw bad(`Item ${item_id} is not delivered yet.`)
    if (quantity > Number(item.quantity)) throw bad(`Quantity for ${item_id} exceeds the ordered quantity.`)
    if (child.return_request && child.return_request.status !== "rejected") throw bad("A return request is already open for this seller.")
    byChild.set(child.id, [...(byChild.get(child.id) ?? []), { item_id: item.id, quantity }])
  }

  const now = new Date().toISOString()
  const return_requests: Record<string, unknown>[] = []
  for (const [vendor_order_id, items] of byChild) {
    const return_request = { status: "requested", reason: body.data.reason, items, note: null, requested_at: now, decided_at: null }
    await patchOrderMetadata(req.scope, vendor_order_id, { return_request })
    return_requests.push({ ...return_request, vendor_order_id })
  }
  res.json({ return_requests })
}
