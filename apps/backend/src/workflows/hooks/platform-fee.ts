import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { syncCartFee } from "../../lib/fees"

// Every cart change (add/update/delete line, customer, channel, shipping) runs refreshCartItemsWorkflow →
// fee line synced right before the payment collection is refreshed, so cart.total + payment amount include it.
refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection(async ({ input }, { container }) => {
  await syncCartFee(container, input.cart_id)
})
