import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { B2B_GROUP, ensureGroup } from "../lib/company"
import { BANK_PROVIDER, COD_PROVIDER, NET_TERMS_PROVIDER } from "../modules/offline-payment/service"
import { commissionSvc } from "../lib/commission"
import { feeSvc } from "../lib/fees"
import { planSvc } from "../lib/plans"

const CHANNELS = ["Retail", "Wholesale"]
// Gateway parked → v1 checkout = cash on delivery + bank transfer; net terms for verified companies with credit.
const PAYMENT_PROVIDERS = [COD_PROVIDER, BANK_PROVIDER, NET_TERMS_PROVIDER]

// medusa exec ./src/scripts/seed-defaults.ts — idempotent (matches by name/title).
// Store currencies USD (default) + EGP, region "Egypt" (payment: COD + bank transfer), sales channels Retail + Wholesale,
// one publishable key each + key "Storefront" on both (the storefront browses with it; carts pass sales_channel_id).
export default async function seedDefaults({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const [store] = await container.resolve(Modules.STORE).listStores()
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          { currency_code: "usd", is_default: true },
          { currency_code: "egp" },
        ],
      },
    },
  })

  const regions = await container.resolve(Modules.REGION).listRegions({ name: "Egypt" })
  if (!regions.length) {
    // ponytail: region priced in USD (all catalog prices are USD today); EGP region/price lists later.
    await createRegionsWorkflow(container).run({
      input: { regions: [{ name: "Egypt", currency_code: "usd", countries: ["eg"], payment_providers: PAYMENT_PROVIDERS }] },
    })
  } else {
    await updateRegionsWorkflow(container).run({
      input: { selector: { id: regions[0].id }, update: { payment_providers: PAYMENT_PROVIDERS } },
    })
  }

  const sc = container.resolve(Modules.SALES_CHANNEL)
  const have = await sc.listSalesChannels({ name: CHANNELS })
  const missing = CHANNELS.filter((n) => !have.some((c) => c.name === n))
  if (missing.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: missing.map((name) => ({ name })) },
    })
    have.push(...result)
  }

  const apiKeys = container.resolve(Modules.API_KEY)
  const ensureKey = async (title: string, channelIds: string[]) => {
    let [key] = await apiKeys.listApiKeys({ title, type: "publishable" })
    if (!key) {
      const { result } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title, type: "publishable", created_by: "" }] },
      })
      key = result[0]
    }
    // Re-linking an already linked channel is a no-op → safe on every run.
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: channelIds } })
    return key.token
  }
  for (const channel of have) {
    logger.info(`seed-defaults: ${channel.name} sales_channel=${channel.id} publishable_key=${await ensureKey(`${channel.name} storefront`, [channel.id])}`)
  }
  logger.info(`seed-defaults: Storefront (Retail + Wholesale) publishable_key=${await ensureKey("Storefront", have.map((c) => c.id))}`)
  await ensureGroup(container, B2B_GROUP)
  await seedMoney(container)
}

// P4 money defaults — idempotent: fee tiers by channel + min_amount, global commission rule, plans by handle.
const B2B_FEE = { channel: "b2b" as const, basis: "monthly_volume" as const, min_fee: 250, max_fee: 6000, label_en: "Platform fee", label_ar: "رسوم المنصة" }
// Decision: below the first WP tier (10k) = first tier → the 0 row.
const FEE_TIERS = [
  ...[[0, 6], [10000, 6], [20000, 5], [30000, 4], [40000, 3]].map(([min_amount, percent]) => ({ ...B2B_FEE, min_amount, percent })),
  { channel: "b2c" as const, basis: "order_total" as const, min_amount: 0, percent: 2, min_fee: null, max_fee: null, label_en: "Service fee", label_ar: "رسوم الخدمة" },
]
const PLANS = [
  { handle: "starter", name_en: "Starter", name_ar: "المبتدئة", price_usd: 0, product_limit: 50, staff_limit: 1, featured_slots: 0, can_b2b: false, analytics_level: "basic" as const },
  { handle: "business", name_en: "Business", name_ar: "الأعمال", price_usd: 49, product_limit: 1000, staff_limit: 5, featured_slots: 0, can_b2b: true, analytics_level: "full" as const },
  { handle: "enterprise", name_en: "Enterprise", name_ar: "المؤسسات", price_usd: 199, product_limit: null, staff_limit: null, featured_slots: 5, can_b2b: true, analytics_level: "full" as const },
]

async function seedMoney(container: ExecArgs["container"]) {
  const fees = feeSvc(container)
  const have = await fees.listFeeTiers({})
  const missing = FEE_TIERS.filter((t) => !have.some((h) => h.channel === t.channel && Number(h.min_amount) === t.min_amount))
  if (missing.length) await fees.createFeeTiers(missing)
  const rules = commissionSvc(container)
  if (!(await rules.listCommissionRules({ scope: "global" })).length) await rules.createCommissionRules({ scope: "global", channel: "all", percent: 10 })
  const plans = planSvc(container)
  const existing = await plans.listPlans({ handle: PLANS.map((p) => p.handle) })
  const newPlans = PLANS.filter((p) => !existing.some((e) => e.handle === p.handle))
  if (newPlans.length) await plans.createPlans(newPlans.map((p) => ({ ...p, interval: "monthly" as const })))
}
