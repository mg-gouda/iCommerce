import type { MedusaContainer } from "@medusajs/framework/types"
import { childOrdersUpdatedSince, rebuildFacts } from "../lib/reports"

// Safety net for missed events: rebuild facts of child orders touched in the last 48 h.
export default async function reportsNightly(container: MedusaContainer) {
  await rebuildFacts(container, await childOrdersUpdatedSince(container, new Date(Date.now() - 48 * 3_600_000)))
}

export const config = { name: "reports-nightly", schedule: "0 2 * * *" }
