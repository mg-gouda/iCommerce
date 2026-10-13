import type { MedusaContainer } from "@medusajs/framework/types"
import { flagOverdue } from "../lib/net-terms"

export default async function netTermsOverdue(container: MedusaContainer) {
  await flagOverdue(container)
}

export const config = { name: "net-terms-overdue", schedule: "0 6 * * *" }
