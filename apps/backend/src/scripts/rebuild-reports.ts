import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { rebuildFacts } from "../lib/reports"
import { vendorOrderLinks } from "../lib/vendor-orders"

// Full backfill of report_line: every vendor child order, fully recomputed (idempotent; safe to re-run).
// medusa exec ./src/scripts/rebuild-reports.ts
export default async function rebuildReports({ container }: ExecArgs) {
  const ids = [...new Set((await vendorOrderLinks(container, {})).map((l) => l.order_id))]
  const rows = await rebuildFacts(container, ids)
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`rebuild-reports: ${ids.length} vendor orders → ${rows} report lines`)
  return { orders: ids.length, rows }
}
