import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { reindexAll } from "../lib/search"

// pnpm --filter @icommerce/backend exec medusa exec ./src/scripts/sync-search.ts
export default async function syncSearch({ container }: ExecArgs) {
  const total = await reindexAll(container)
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`sync-search: indexed ${total} published products`)
}
