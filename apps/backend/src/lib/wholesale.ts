import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, PriceListStatus, PriceListType } from "@medusajs/framework/utils"
import { batchPriceListPricesWorkflow, createPriceListsWorkflow } from "@medusajs/medusa/core-flows"
import { B2B_GROUP, ensureGroup, wholesaleChannelId } from "./company"

export type Tier = { min_qty: number; unit_price_usd: number }
const WHOLESALE_LIST = "B2B wholesale"

/**
 * Price list by title, created on first use: type override, rules = customer group + Wholesale sales channel.
 * Medusa then picks the tier whose min_quantity fits the cart line (cheapest match wins inside one list).
 */
export async function ensurePriceList(scope: MedusaContainer, title: string, group: string) {
  const pricing = scope.resolve(Modules.PRICING)
  const list = (await pricing.listPriceLists({ q: title }, { select: ["id", "title"] })).find((l) => l.title === title)
  if (list) return list.id
  const g = await ensureGroup(scope, group)
  const { result } = await createPriceListsWorkflow(scope).run({
    input: {
      price_lists_data: [
        {
          title,
          description: `Auto-managed (${group})`,
          status: PriceListStatus.ACTIVE,
          type: PriceListType.OVERRIDE,
          rules: { "customer.groups.id": [g.id], sales_channel_id: [(await wholesaleChannelId(scope))!] },
        } as never,
      ],
    },
  })
  return result[0].id
}
export const wholesaleListId = (scope: MedusaContainer) => ensurePriceList(scope, WHOLESALE_LIST, B2B_GROUP)

/** Prices of `list_id` on the given variants (variant → price set via link, then the pricing module). */
export async function listPrices(scope: MedusaContainer, list_id: string, variant_ids: string[]) {
  if (!variant_ids.length) return []
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "price_set.id"],
    filters: { id: variant_ids },
  })
  const sets = data.map((v: { price_set?: { id: string } | null }) => v.price_set?.id).filter(Boolean) as string[]
  if (!sets.length) return []
  return scope
    .resolve(Modules.PRICING)
    .listPrices({ price_set_id: sets, price_list_id: [list_id] } as never, { select: ["id", "amount", "min_quantity", "currency_code"] })
}

/** Replaces the list's prices on these variants. */
export async function replacePrices(
  scope: MedusaContainer,
  list_id: string,
  variant_ids: string[],
  create: { variant_id: string; amount: number; min_quantity?: number }[],
) {
  const old = await listPrices(scope, list_id, variant_ids)
  await batchPriceListPricesWorkflow(scope).run({
    input: { data: { id: list_id, delete: old.map((p) => p.id), update: [], create: create.map((c) => ({ ...c, currency_code: "usd" })) } },
  })
}

const productVariantIds = async (scope: MedusaContainer, product_id: string) =>
  (await scope.resolve(Modules.PRODUCT).listProductVariants({ product_id }, { select: ["id"] })).map((v) => v.id)

/** A product's tiers (read from its first variant; every variant carries the same tiers). */
export async function getTiers(scope: MedusaContainer, product_id: string): Promise<Tier[]> {
  const [first] = await productVariantIds(scope, product_id)
  if (!first) return []
  const prices = await listPrices(scope, await wholesaleListId(scope), [first])
  return prices
    .filter((p) => p.currency_code === "usd")
    .map((p) => ({ min_qty: Number(p.min_quantity ?? 1), unit_price_usd: Number(p.amount) }))
    .sort((a, b) => a.min_qty - b.min_qty)
}

export async function setTiers(scope: MedusaContainer, product_id: string, tiers: Tier[]) {
  const variants = await productVariantIds(scope, product_id)
  await replacePrices(
    scope,
    await wholesaleListId(scope),
    variants,
    variants.flatMap((variant_id) => tiers.map((t) => ({ variant_id, amount: t.unit_price_usd, min_quantity: t.min_qty }))),
  )
}
