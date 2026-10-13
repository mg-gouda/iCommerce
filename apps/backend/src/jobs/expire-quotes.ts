import type { MedusaContainer } from "@medusajs/framework/types"
import { expireQuotes } from "../lib/quotes"

export default async function expireQuotesJob(container: MedusaContainer) {
  await expireQuotes(container)
}

export const config = { name: "expire-quotes", schedule: "0 * * * *" }
