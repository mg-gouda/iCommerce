import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import type VendorModuleService from "../../../../../modules/vendor/service"
import { BANK_PROVIDER } from "../../../../../modules/offline-payment/service"
import { childOrders, ownParentOr404 } from "../../helpers"

// Customer's per-vendor progress for one of their orders + payment state.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parent = await ownParentOr404(req)
  const children = await childOrders(req, parent)
  const vendors = children.length
    ? await req.scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({ id: children.map((c) => c.vendor_id) }, { select: ["id", "name", "handle"] })
    : []
  const p = parent.payment
  const captured = (p?.captures ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  res.json({
    vendor_orders: children.map(({ email, buyer, shipping_address, vendor_id, ...c }) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
      ...c,
      vendor: vendors.find((v) => v.id === vendor_id) ?? null,
    })),
    payment: p
      ? {
          provider_id: p.provider_id,
          status: p.canceled_at ? "canceled" : captured >= Number(p.amount) ? "captured" : captured > 0 ? "partially_captured" : "authorized",
          bank_details: p.provider_id === BANK_PROVIDER ? (process.env.BANK_TRANSFER_DETAILS ?? "") : null,
          proof_uploaded_at: parent.metadata?.payment_proof?.uploaded_at ?? null,
        }
      : null,
  })
}
