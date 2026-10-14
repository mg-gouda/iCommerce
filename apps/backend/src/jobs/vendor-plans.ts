import type { MedusaContainer } from "@medusajs/framework/types"
import { flagPastDue, hiddenVendorIds, productIdsOf } from "../lib/plans"
import { syncProduct } from "../lib/search"

// Daily: unpaid periods → past_due (+ email); vendors past the grace period drop out of search (storefront filter is live).
export default async function vendorPlans(container: MedusaContainer) {
  await flagPastDue(container)
  for (const id of await productIdsOf(container, await hiddenVendorIds(container))) await syncProduct(container, id)
}

export const config = { name: "vendor-plans", schedule: "0 5 * * *" }
