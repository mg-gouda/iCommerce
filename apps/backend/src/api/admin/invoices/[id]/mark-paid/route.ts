import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { companySvc } from "../../../../../lib/company"
import { shapeInvoice } from "../../../../../lib/net-terms"
import { parentPayments, patchOrderMetadata } from "../../../../../lib/vendor-orders"

// Money received → capture the net-terms payment, invoice paid, vendor orders paid; releases credit.
// ponytail: an account put on hold by the overdue job (or by hand) is re-activated once no overdue invoice is left.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = companySvc(req.scope)
  const inv = await svc.retrieveInvoice(req.params.id)
  if (inv.status === "paid") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invoice already paid.")
  const o = (await parentPayments(req.scope, [inv.order_id])).get(inv.order_id)
  const p = o?.payment
  if (p && !p.captured_at) {
    const captured = (p.captures ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
    const amount = Number(p.amount) - captured
    if (amount > 0) await capturePaymentWorkflow(req.scope).run({ input: { payment_id: p.id, amount, captured_by: req.auth_context.actor_id } })
  }
  const paid_at = new Date()
  for (const id of (o?.metadata?.vendor_order_ids ?? []) as string[]) await patchOrderMetadata(req.scope, id, { paid_at: paid_at.toISOString() })
  const invoice = await svc.updateInvoices({ id: inv.id, status: "paid", paid_at })
  const overdue = await svc.listInvoices({ company_id: inv.company_id, status: "overdue" })
  const [account] = await svc.listCreditAccounts({ company_id: inv.company_id })
  if (account?.status === "on_hold" && !overdue.length) await svc.updateCreditAccounts({ id: account.id, status: "active" })
  res.json({ invoice: shapeInvoice(invoice) })
}
