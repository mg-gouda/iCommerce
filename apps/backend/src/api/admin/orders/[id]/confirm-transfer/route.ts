import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { parentPayments, patchOrderMetadata } from "../../../../../lib/vendor-orders"
import { BANK_PROVIDER } from "../../../../../modules/offline-payment/service"

// Admin saw the money arrive → capture the bank-transfer payment; vendor orders become "paid" (shippable).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const o = (await parentPayments(req.scope, [req.params.id])).get(req.params.id)
  if (!o) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${req.params.id}" not found`)
  const p = o.payment
  if (p?.provider_id !== BANK_PROVIDER) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order is not paid by bank transfer.")
  if (p.captured_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Transfer already confirmed.")
  const captured = (p.captures ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  const amount = Number(p.amount) - captured
  await capturePaymentWorkflow(req.scope).run({ input: { payment_id: p.id, amount, captured_by: req.auth_context.actor_id } })
  const paid_at = new Date().toISOString()
  for (const id of (o.metadata?.vendor_order_ids ?? []) as string[]) await patchOrderMetadata(req.scope, id, { paid_at })
  res.json({ order_id: o.id, captured: amount })
}
