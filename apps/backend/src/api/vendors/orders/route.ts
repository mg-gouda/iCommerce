import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { loadVendorOrders, vendorOrderLinks } from "../../../lib/vendor-orders"
import { getCaller } from "../helpers"
import { GetVendorOrders } from "./validators"

// ponytail: link rows → id list → order query (same pattern as vendor products); fine until a vendor has ~10k orders.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = GetVendorOrders.safeParse(req.query)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.message)
  const { status, q, limit, offset } = parsed.data
  const { vendor } = await getCaller(req)
  const links = await vendorOrderLinks(req.scope, { vendor_id: vendor.id, ...(status && { status }) })
  if (!links.length) return res.json({ orders: [], count: 0, limit, offset })

  const { data, metadata } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id"],
    filters: { id: links.map((l) => l.order_id), ...(q && { q }) },
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })
  const orders = await loadVendorOrders(
    req.scope,
    data.map((o: { id: string }) => o.id),
    new Map(links.map((l) => [l.order_id, l.status])),
  )
  res.json({ orders, count: metadata?.count ?? orders.length, limit, offset })
}
