import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { COD_PROVIDER } from "../modules/offline-payment/service"
import { LEDGER_STATUSES, LEDGER_TYPES } from "../modules/payout/models/ledger"
import { PAYOUT_MODULE } from "../modules/payout"
import type PayoutModuleService from "../modules/payout/service"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { cents, major } from "./money"
import type { VendorOrder } from "./vendor-orders"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86_400_000
export const holdDays = () => Number(process.env.PAYOUT_HOLD_DAYS ?? 7)
export const payoutSvc = (scope: MedusaContainer): PayoutModuleService => scope.resolve(PAYOUT_MODULE)
const bad = (msg: string) => new MedusaError(MedusaError.Types.INVALID_DATA, msg)

export const LedgerQuery = z.object({
  type: z.enum(LEDGER_TYPES).optional(),
  status: z.enum(LEDGER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const shapeEntry = (e: Row) => ({
  id: e.id, vendor_id: e.vendor_id, vendor_order_id: e.vendor_order_id, order_display_id: e.order_display_id, type: e.type,
  amount: Number(e.amount), currency_code: e.currency_code, status: e.status, available_at: e.available_at, batch_id: e.batch_id,
  note: e.note, created_at: e.created_at,
})

/**
 * Delivered vendor order → ledger (idempotent per order). Signs = vendor's side (Σ = what the platform owes the vendor).
 * All: sale +total, commission −commission_total. COD adds payout −total ("cod_cash", the vendor's courier holds the cash)
 * and fee_collected −fee_share (fee the vendor collected on the platform's behalf).
 */
export async function postDelivery(scope: MedusaContainer, o: VendorOrder, delivered_at = new Date()) {
  const svc = payoutSvc(scope)
  if ((await svc.listLedgerEntries({ vendor_order_id: o.id, type: "sale" })).length) return []
  const base = { vendor_id: o.vendor_id, vendor_order_id: o.id, order_display_id: o.display_id, status: "pending" as const, available_at: new Date(+delivered_at + holdDays() * DAY) }
  const S = cents(o.total)
  const rows: Row[] = [
    { ...base, type: "sale", amount: major(S) },
    { ...base, type: "commission", amount: -o.commission_total },
  ]
  if (o.payment.provider_id === COD_PROVIDER) {
    rows.push({ ...base, type: "payout", amount: -major(S), note: "cod_cash" })
    if (o.fee_share) rows.push({ ...base, type: "fee_collected", amount: -o.fee_share })
  }
  return (await svc.createLedgerEntries(rows.filter((r) => r.amount !== 0) as never)) as unknown as Row[]
}

/**
 * Refund after delivery: refund −R, commission reversed pro rata on items (+C × min(R, items) / items). Fee untouched.
 * Available right away when the order's sale entry already is, else pending with the same available_at.
 */
export async function postRefund(scope: MedusaContainer, o: VendorOrder, amount: number, note?: string | null) {
  const svc = payoutSvc(scope)
  const entries = await svc.listLedgerEntries({ vendor_order_id: o.id })
  const sale = entries.find((e) => e.type === "sale")
  if (!sale) throw bad("Only delivered orders can be refunded here.")
  const R = cents(amount)
  const refunded = -entries.filter((e) => e.type === "refund").reduce((s, e) => s + cents(e.amount), 0)
  if (R <= 0 || R > cents(sale.amount) - refunded) throw bad(`Refund must be between 0.01 and ${major(cents(sale.amount) - refunded).toFixed(2)}.`)
  const items = cents(o.item_total)
  const back = items ? Math.round((cents(o.commission_total) * Math.min(R, items)) / items) : 0
  const done = sale.status !== "pending"
  const base = { vendor_id: o.vendor_id, vendor_order_id: o.id, order_display_id: o.display_id, status: done ? ("available" as const) : ("pending" as const), available_at: done ? new Date() : sale.available_at, note: note ?? null }
  const rows: Row[] = [{ ...base, type: "refund", amount: -major(R) }]
  if (back) rows.push({ ...base, type: "commission", amount: major(back), note: note ?? "refund" })
  return (await svc.createLedgerEntries(rows as never)) as unknown as Row[]
}

/** Hourly: pending entries past their hold whose vendor order is paid (metadata.paid_at) → available. */
export async function releaseAvailable(scope: MedusaContainer, now = new Date()) {
  const svc = payoutSvc(scope)
  const due = await svc.listLedgerEntries({ status: "pending", available_at: { $lte: now } })
  if (!due.length) return 0
  const orderIds = [...new Set(due.map((e) => e.vendor_order_id).filter(Boolean))] as string[]
  const { data } = orderIds.length
    ? await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "order", fields: ["id", "metadata"], filters: { id: orderIds } })
    : { data: [] }
  const paid = new Set((data as Row[]).filter((o) => o.metadata?.paid_at).map((o) => o.id))
  const ready = due.filter((e) => !e.vendor_order_id || paid.has(e.vendor_order_id))
  if (ready.length) await svc.updateLedgerEntries(ready.map((e) => ({ id: e.id, status: "available" as const })))
  return ready.length
}

/** Vendor money summary (signed). */
export async function vendorSummary(scope: MedusaContainer, vendor_id: string) {
  const svc = payoutSvc(scope)
  const open = await svc.listLedgerEntries({ vendor_id, status: ["pending", "available"] })
  const sum = (f: (e: Row) => boolean) => major(open.filter(f).reduce((s, e) => s + cents(e.amount), 0))
  const paid = await svc.listPayoutBatches({ vendor_id, status: "paid" })
  const balance = sum(() => true)
  return {
    pending: sum((e) => e.status === "pending"),
    available: sum((e) => e.status === "available" && !e.batch_id),
    balance,
    owed: balance < 0 ? -balance : 0,
    paid_total: major(paid.reduce((s, b) => s + cents(b.amount), 0)),
  }
}

export async function shapeBatches(scope: MedusaContainer, batches: Row[]) {
  if (!batches.length) return []
  const vendors = await (scope.resolve(VENDOR_MODULE) as VendorModuleService).listVendors({ id: [...new Set(batches.map((b) => b.vendor_id))] }, { select: ["id", "name", "handle"] })
  const entries = await payoutSvc(scope).listLedgerEntries({ batch_id: batches.map((b) => b.id) }, { select: ["id", "batch_id", "type"] })
  return batches.map((b) => ({
    id: b.id, vendor_id: b.vendor_id, vendor: vendors.find((v) => v.id === b.vendor_id) ?? null, amount: Number(b.amount), currency_code: b.currency_code,
    status: b.status, reference: b.reference, paid_at: b.paid_at, entry_count: entries.filter((e) => e.batch_id === b.id && e.type !== "payout").length,
    created_at: b.created_at,
  }))
}

/** Batch = every available, unbatched entry of the vendor (±); must sum > 0. */
export async function createBatch(scope: MedusaContainer, vendor_id: string) {
  const svc = payoutSvc(scope)
  const entries = (await svc.listLedgerEntries({ vendor_id, status: "available" })).filter((e) => !e.batch_id)
  const amount = entries.reduce((s, e) => s + cents(e.amount), 0)
  if (amount <= 0) throw bad("Nothing to pay out.")
  const batch = await svc.createPayoutBatches({ vendor_id, amount: major(amount) })
  await svc.updateLedgerEntries(entries.map((e) => ({ id: e.id, batch_id: batch.id })))
  return batch
}

/** Paid: batch + its entries → paid, plus one payout −amount entry (note = reference). */
export async function markBatchPaid(scope: MedusaContainer, id: string, reference: string) {
  const svc = payoutSvc(scope)
  const batch = await svc.retrievePayoutBatch(id)
  if (batch.status === "paid") throw bad("Batch already paid.")
  const paid_at = new Date()
  const entries = await svc.listLedgerEntries({ batch_id: id })
  if (entries.length) await svc.updateLedgerEntries(entries.map((e) => ({ id: e.id, status: "paid" as const })))
  await svc.createLedgerEntries({ vendor_id: batch.vendor_id, type: "payout", amount: -Number(batch.amount), status: "paid", available_at: paid_at, batch_id: id, note: reference })
  return svc.updatePayoutBatches({ id, status: "paid", reference, paid_at })
}
