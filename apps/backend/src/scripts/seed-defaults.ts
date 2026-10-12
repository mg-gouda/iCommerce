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
import { BANK_PROVIDER, COD_PROVIDER } from "../modules/offline-payment/service"

const CHANNELS = ["Retail", "Wholesale"]
// Gateway parked → v1 checkout = cash on delivery + bank transfer.
const PAYMENT_PROVIDERS = [COD_PROVIDER, BANK_PROVIDER]

// medusa exec ./src/scripts/seed-defaults.ts — idempotent (matches by name/title).
// Store currencies USD (default) + EGP, region "Egypt" (payment: COD + bank transfer), sales channels Retail + Wholesale, one publishable key each.
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
  for (const channel of have) {
    const title = `${channel.name} storefront`
    let [key] = await apiKeys.listApiKeys({ title, type: "publishable" })
    if (!key) {
      const { result } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title, type: "publishable", created_by: "" }] },
      })
      key = result[0]
      await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } })
    }
    logger.info(`seed-defaults: ${channel.name} sales_channel=${channel.id} publishable_key=${key.token}`)
  }
}
