import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"
import {
  cancelOrderWorkflow,
  capturePaymentWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { sendEmail, type Template } from "../../../../../lib/emails"
import {
  getVendorOrderOr404,
  parentPayments,
  patchOrderMetadata,
  setVendorOrderStatus,
  type VendorOrder,
  type VendorOrderStatus,
} from "../../../../../lib/vendor-orders"
import { BANK_PROVIDER, COD_PROVIDER } from "../../../../../modules/offline-payment/service"
import { getCaller } from "../../../helpers"
import { PostCancel, PostFulfill, PostReturnDecision } from "../../validators"

const parse = <T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> => {
  const r = schema.safeParse(body ?? {})
  if (!r.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, r.error.message)
  return r.data
}
const need = (ok: boolean, msg: string) => {
  if (!ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, msg)
}

async function emailBuyer(scope: MedusaContainer, o: VendorOrder, template: Template, vendor_name: string) {
  const parent = (await parentPayments(scope, [o.parent_order_id])).get(o.parent_order_id)
  const f = o.fulfillment
  await sendEmail(scope, {
    to: o.email,
    template,
    locale: parent?.customer?.metadata?.locale,
    data: { display_id: o.display_id, currency_code: o.currency_code, vendor_name, carrier: f?.carrier, tracking_number: f?.tracking_number, tracking_url: f?.tracking_url },
    key: `${template}-${o.id}`,
  })
}

type Ctx = { scope: MedusaContainer; order: VendorOrder; vendor: { id: string; name: string }; body: unknown }
const items = (o: VendorOrder) => o.items.map((i) => ({ id: i.id, quantity: i.quantity }))

const ACTIONS: Record<string, (c: Ctx) => Promise<VendorOrderStatus | void>> = {
  async fulfill({ scope, order, vendor, body }) {
    const { carrier, tracking_number, tracking_url } = parse(PostFulfill, body)
    need(order.status === "pending", `Order is ${order.status}; only pending orders can be shipped.`)
    need(order.payment.provider_id !== BANK_PROVIDER || order.payment.status === "paid", "Awaiting bank transfer confirmation.")
    const { result: f } = await createOrderFulfillmentWorkflow(scope).run({
      input: { order_id: order.id, items: items(order), metadata: { carrier } },
    })
    await createOrderShipmentWorkflow(scope).run({
      input: {
        order_id: order.id,
        fulfillment_id: f.id,
        items: items(order),
        labels: [{ tracking_number, tracking_url: tracking_url ?? "", label_url: tracking_url ?? "" }],
      },
    })
    await setVendorOrderStatus(scope, vendor.id, order.id, "shipped")
    await emailBuyer(scope, await getVendorOrderOr404(scope, vendor.id, order.id), "order-shipped", vendor.name)
  },

  async deliver({ scope, order, vendor }) {
    need(order.status === "shipped", `Order is ${order.status}; only shipped orders can be delivered.`)
    await markOrderFulfillmentAsDeliveredWorkflow(scope).run({ input: { orderId: order.id, fulfillmentId: order.fulfillment!.id } })
    if (order.payment.provider_id === COD_PROVIDER && order.payment.status !== "paid") {
      const payment = (await parentPayments(scope, [order.parent_order_id])).get(order.parent_order_id)?.payment
      // Cash collected by the vendor's courier → capture this vendor's share of the parent's single payment.
      await capturePaymentWorkflow(scope).run({ input: { payment_id: payment.id, amount: order.total } })
      await patchOrderMetadata(scope, order.id, { paid_at: new Date().toISOString() })
    }
    await setVendorOrderStatus(scope, vendor.id, order.id, "delivered")
    await emailBuyer(scope, order, "order-delivered", vendor.name)
  },

  // ponytail: canceling one vendor order leaves the parent's payment authorized for the rest; nothing is refunded automatically.
  async cancel({ scope, order, vendor, body }) {
    const { reason } = parse(PostCancel, body)
    need(order.status === "pending", `Order is ${order.status}; only pending orders can be canceled.`)
    await cancelOrderWorkflow(scope).run({ input: { order_id: order.id } })
    await patchOrderMetadata(scope, order.id, { cancel_reason: reason })
    await setVendorOrderStatus(scope, vendor.id, order.id, "canceled")
  },

  async "return-request"({ scope, order, body }) {
    const { action, note } = parse(PostReturnDecision, body)
    need(order.return_request?.status === "requested", "No open return request on this order.")
    await patchOrderMetadata(scope, order.id, {
      return_request: { ...order.return_request, status: action === "approve" ? "approved" : "rejected", note: note ?? null, decided_at: new Date().toISOString() },
    })
  },
}

// POST /vendors/orders/:id/{fulfill|deliver|cancel|return-request}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const run = ACTIONS[req.params.action]
  if (!run) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown action "${req.params.action}"`)
  const { vendor } = await getCaller(req)
  const order = await getVendorOrderOr404(req.scope, vendor.id, req.params.id)
  await run({ scope: req.scope, order, vendor, body: req.body })
  res.json({ order: await getVendorOrderOr404(req.scope, vendor.id, req.params.id) })
}
