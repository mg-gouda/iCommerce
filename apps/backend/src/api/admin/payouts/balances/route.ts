import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { payoutSvc } from "../../../../lib/ledger"
import { cents, major } from "../../../../lib/money"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import type VendorModuleService from "../../../../modules/vendor/service"

// Per vendor: Σ pending, Σ available (incl. entries in open batches), balance = Σ unpaid. ponytail: in-memory sum, fine until ledgers get big.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const entries = await payoutSvc(req.scope).listLedgerEntries({ status: ["pending", "available"] }, { select: ["vendor_id", "status", "amount"] })
  const by = new Map<string, { pending: number; available: number }>()
  for (const e of entries) {
    const b = by.get(e.vendor_id) ?? { pending: 0, available: 0 }
    b[e.status as "pending" | "available"] += cents(e.amount)
    by.set(e.vendor_id, b)
  }
  const vendors = by.size
    ? await req.scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({ id: [...by.keys()] }, { select: ["id", "name", "handle"] })
    : []
  const balances = [...by.entries()]
    .map(([id, b]) => ({ vendor: vendors.find((v) => v.id === id) ?? { id, name: id, handle: null }, pending: major(b.pending), available: major(b.available), balance: major(b.pending + b.available) }))
    .sort((a, b) => b.balance - a.balance)
  res.json({ balances })
}
