import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeFee, feeSvc, isFeeLine, monthlyVolumeCents, type PlatformFee } from "./fees"
import { cents } from "./money"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const OPEN = ["offered", "negotiating", "pending_approval", "accepted"]

/**
 * Buyer-side quote shapes + `fee`: the order's snapshot once ordered, a live b2b preview for open quotes with a total
 * (company's current monthly volume), else null. `raw` = module rows (customer_id), `shaped` = shapeQuotes output.
 */
export async function withQuoteFees<T extends { id: string; status: string; total: number | null; order_id: string | null }>(
  scope: MedusaContainer,
  raw: Row[],
  shaped: T[],
): Promise<(T & { fee: PlatformFee | null })[]> {
  const orderIds = shaped.map((q) => q.order_id).filter(Boolean) as string[]
  const snap = new Map<string, PlatformFee>()
  if (orderIds.length) {
    const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "order", fields: ["id", "items.metadata"], filters: { id: orderIds } })
    for (const o of data as Row[]) {
      const line = (o.items ?? []).find(isFeeLine)
      if (line) snap.set(o.id, line.metadata.platform_fee)
    }
  }
  const open = shaped.filter((q) => !q.order_id && q.total != null && OPEN.includes(q.status))
  const tiers = open.length ? ((await feeSvc(scope).listFeeTiers({ channel: "b2b" })) as Row[]) : []
  const volume = new Map<string, number>()
  const customer = new Map(raw.map((q) => [q.id as string, q.customer_id as string]))
  return Promise.all(
    shaped.map(async (q) => {
      if (q.order_id) return { ...q, fee: snap.get(q.order_id) ?? null }
      if (!open.includes(q) || !tiers.length) return { ...q, fee: null }
      const c = customer.get(q.id)!
      if (!volume.has(c)) volume.set(c, await monthlyVolumeCents(scope, "b2b", c))
      return { ...q, fee: computeFee(tiers, "b2b", cents(q.total), volume.get(c)!) }
    }),
  )
}
