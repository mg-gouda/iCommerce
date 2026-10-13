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
}
