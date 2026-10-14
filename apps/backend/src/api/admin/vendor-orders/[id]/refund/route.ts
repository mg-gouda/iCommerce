import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { postRefund, shapeEntry } from "../../../../../lib/ledger"
import { parse } from "../../../../../lib/parse"
import { loadVendorOrders, vendorOrderLinks } from "../../../../../lib/vendor-orders"

// Books a post-delivery refund / cancel on the vendor's ledger. ponytail: the buyer refund itself is manual (Medusa admin / bank).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { amount, note } = parse(z.object({ amount: z.number().positive(), note: z.string().trim().max(200).optional() }).strict(), req.body)
  const [link] = await vendorOrderLinks(req.scope, { order_id: req.params.id })
  if (!link) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Vendor order with id "${req.params.id}" not found`)
  if (link.status !== "delivered") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only delivered orders can be refunded here.")
  const [order] = await loadVendorOrders(req.scope, [req.params.id], new Map([[req.params.id, link.status]]))
  const entries = await postRefund(req.scope, order, amount, note)
  res.json({ entries: entries.map(shapeEntry) })
}
