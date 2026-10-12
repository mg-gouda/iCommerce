import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { loadVendorOrders, parentPayments, vendorOrderLinks } from "../../../lib/vendor-orders"

/** Caller's own parent order (+ payment); anyone else's — or a vendor child order — is a 404. */
export async function ownParentOr404(req: AuthenticatedMedusaRequest) {
  const parent = (await parentPayments(req.scope, [req.params.id])).get(req.params.id)
  if (!parent || parent.customer_id !== req.auth_context.actor_id || parent.metadata?.parent_order_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${req.params.id}" not found`)
  }
  return parent as typeof parent & { id: string; metadata: Record<string, any> | null } // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function childOrders(req: AuthenticatedMedusaRequest, parent: { metadata: Record<string, unknown> | null }) {
  const ids = (parent.metadata?.vendor_order_ids ?? []) as string[]
  const links = ids.length ? await vendorOrderLinks(req.scope, { order_id: ids }) : []
  return loadVendorOrders(req.scope, ids, new Map(links.map((l) => [l.order_id, l.status])))
}
