import type { MedusaContainer } from "@medusajs/framework/types"
import { releaseAvailable } from "../lib/ledger"

export default async function payoutRelease(container: MedusaContainer) {
  await releaseAvailable(container)
}

export const config = { name: "payout-release", schedule: "15 * * * *" }
