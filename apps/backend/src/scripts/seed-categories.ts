import { readFileSync } from "node:fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"

type Cat = { legacy_id: string | number; name: string; handle: string; parent_legacy_id: string | number | null }

// medusa exec ./src/scripts/seed-categories.ts tools/migrate-wp/out/categories.json
// Idempotent by handle: existing categories are skipped (not updated).
export default async function seedCategories({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const [file] = args
  if (!file) throw new Error("usage: medusa exec ./src/scripts/seed-categories.ts <categories.json>")
  const cats: Cat[] = JSON.parse(readFileSync(file, "utf8"))

  const product = container.resolve(Modules.PRODUCT)
  const existing = await product.listProductCategories({ handle: cats.map((c) => c.handle) }, { select: ["id", "handle"] })
  const idByHandle = new Map(existing.map((c) => [c.handle, c.id]))
  const handleByLegacy = new Map(cats.map((c) => [String(c.legacy_id), c.handle]))

  // Create level by level: a category is ready once its parent exists.
  let pending = cats.filter((c) => !idByHandle.has(c.handle))
  let created = 0
  while (pending.length) {
    const parentId = (c: Cat) =>
      c.parent_legacy_id == null ? null : idByHandle.get(handleByLegacy.get(String(c.parent_legacy_id)) ?? "")
    const ready = pending.filter((c) => parentId(c) !== undefined)
    if (!ready.length) {
      throw new Error(`Unresolvable parents for: ${pending.map((c) => c.handle).join(", ")}`)
    }
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: ready.map((c) => ({
          name: c.name,
          handle: c.handle,
          parent_category_id: parentId(c),
          is_active: true,
          metadata: { legacy_id: String(c.legacy_id) },
        })),
      },
    })
    result.forEach((c) => idByHandle.set(c.handle, c.id))
    created += result.length
    pending = pending.filter((c) => !idByHandle.has(c.handle))
  }
  logger.info(`seed-categories: ${created} created, ${cats.length - created} already existed`)
}
