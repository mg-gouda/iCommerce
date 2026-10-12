import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendEmail } from "../lib/emails"
import { loadVendorOrders } from "../lib/vendor-orders"
import { BANK_PROVIDER } from "../modules/offline-payment/service"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { splitVendorOrdersWorkflow } from "../workflows/split-vendor-orders"

// Parent order placed → split per vendor → emails (customer, bank instructions, each vendor owner).
// Emails carry idempotency keys, so a redelivered event doesn't double-send.
export default async function orderPlaced({ event, container }: SubscriberArgs<{ id: string }>) {
  await splitVendorOrdersWorkflow(container).run({ input: { order_id: event.data.id } })

  const { data: [o] } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id", "display_id", "email", "currency_code", "total", "metadata",
      "items.title", "items.quantity", "items.total",
      "customer.metadata", "payment_collections.payments.provider_id", "payment_collections.payments.data",
    ],
    filters: { id: event.data.id },
  })
  if (!o || o.metadata?.parent_order_id) return
  const locale = o.customer?.metadata?.locale
  const data = { display_id: o.display_id, currency_code: o.currency_code, total: Number(o.total) }
  const items = (o.items ?? []).map((i: { title: string; quantity: number; total: number }) => ({ title: i.title, quantity: Number(i.quantity), total: Number(i.total) }))
  await sendEmail(container, { to: o.email, template: "order-placed", locale, data: { ...data, items }, key: `order-placed-${o.id}` })

  const payment = o.payment_collections?.flatMap((c: { payments?: unknown[] } | null) => c?.payments ?? [])[0] as
    | { provider_id: string; data?: { bank_details?: string } }
    | undefined
  if (payment?.provider_id === BANK_PROVIDER) {
    const bank_details = payment.data?.bank_details || process.env.BANK_TRANSFER_DETAILS || ""
    await sendEmail(container, { to: o.email, template: "bank-transfer", locale, data: { ...data, bank_details }, key: `bank-transfer-${o.id}` })
  }

  const childIds = (o.metadata?.vendor_order_ids ?? []) as string[]
  const children = await loadVendorOrders(container, childIds, new Map())
  const vendorSvc: VendorModuleService = container.resolve(VENDOR_MODULE)
  for (const child of children) {
    const vendor = await vendorSvc.retrieveVendor(child.vendor_id, { relations: ["users"] })
    const owner = vendor.users?.find((u) => u.role === "owner")
    await sendEmail(container, {
      to: owner?.email ?? vendor.email,
      template: "vendor-new-order",
      data: {
        display_id: child.display_id, currency_code: child.currency_code, total: Number(child.total), vendor_name: vendor.name,
        items: child.items.map((i) => ({ title: i.title, quantity: Number(i.quantity), total: Number(i.total) })),
      },
      key: `vendor-new-order-${child.id}`,
    })
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
