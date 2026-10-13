import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { companySvc } from "../lib/company"
import { NET_TERMS_PROVIDER } from "../modules/offline-payment/service"

// Net-terms order placed → open invoice due in `terms_days`. Idempotent (invoice.order_id is unique).
export default async function netTermsInvoice({ event, container }: SubscriberArgs<{ id: string }>) {
  const { data: [o] } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "display_id", "customer_id", "total", "currency_code", "metadata", "payment_collections.payments.provider_id"],
    filters: { id: event.data.id },
  })
  const provider = o?.payment_collections?.flatMap((c) => c?.payments ?? [])[0]?.provider_id
  if (!o || o.metadata?.parent_order_id || provider !== NET_TERMS_PROVIDER) return
  const svc = companySvc(container)
  if ((await svc.listInvoices({ order_id: o.id })).length) return
  const [member] = await svc.listCompanyMembers({ customer_id: o.customer_id! })
  if (!member) return
  const company_id = (member as unknown as { company_id: string }).company_id
  const [account] = await svc.listCreditAccounts({ company_id })
  await svc.createInvoices({
    company_id,
    order_id: o.id,
    display_id: o.display_id,
    amount: Number(o.total),
    currency_code: o.currency_code,
    due_date: new Date(Date.now() + (account?.terms_days ?? 30) * 86_400_000),
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
