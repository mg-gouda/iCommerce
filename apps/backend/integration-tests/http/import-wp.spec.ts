import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import importWp from "../../src/scripts/import-wp"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    it("imports the WP fixture idempotently", async () => {
      // Copy: the importer writes image-map.json + import-report.md next to its input.
      const dir = mkdtempSync(join(tmpdir(), "wp-out-"))
      cpSync(join(__dirname, "../fixtures/wp-out"), dir, { recursive: true })
      const container = getContainer()
      const run = () => importWp({ container, args: [dir] })
      const query = container.resolve("query")
      const products = async () =>
        (
          await query.graph({
            entity: "product",
            fields: ["title", "handle", "status", "description", "thumbnail", "images.url", "metadata", "variants.sku", "variants.prices.amount", "tags.value", "categories.handle", "sales_channels.name", "product_extra.*", "vendor.legacy_id"],
            filters: {},
          })
        ).data.sort((a, b) => a.handle.localeCompare(b.handle))

      const first = await run()
      expect(first.vendors).toMatchObject({ created: 2, owner_users_created: 2, skipped: { "duplicate email": 1 } })
      expect(first.products).toMatchObject({
        created: 3,
        skipped: { "empty title": 1, "orphan (vendor not in dump)": 1 },
        failed: {},
        notes: { "sku dropped (duplicate of earlier product)": 1, "max_qty dropped (< min_qty)": 1, "min_qty/qty_step dropped (not a positive integer)": 1 },
      })
      expect(first.images).toMatchObject({ uploaded: 2, missing: 1 })

      const { data: vendors } = await query.graph({ entity: "vendor", fields: ["legacy_id", "status", "kyc_status", "logo", "description", "users.email", "users.role"], filters: {} })
      const byLegacy = Object.fromEntries(vendors.map((v) => [v.legacy_id, v]))
      expect(byLegacy["101"]).toMatchObject({ status: "approved", kyc_status: "submitted", description: "<p>Steel </p>", users: [{ email: "owner@steel.test", role: "owner" }] })
      expect(byLegacy["101"].logo).toMatch(/^http/)
      expect(byLegacy["102"]).toMatchObject({ status: "pending", kyc_status: "none" })
      expect(byLegacy["103"]).toBeUndefined()

      const [pot, pipe, sheet] = await products()
      expect(pipe).toMatchObject({
        status: "published",
        description: "<p>Seamless <b>pipe</b></p>",
        metadata: { sale_price_usd: 10, wp_attributes: { color: ["grey"] } },
        variants: [{ sku: "FX-1", prices: [{ amount: 12.5 }] }],
        categories: [{ handle: "fixture-pipes" }],
        product_extra: { unit: "ton", min_qty: 5, max_qty: null, qty_step: 5, hs_code: "7304", b2b_only: false, b2c_enabled: true, origin_country: "EG", legacy_id: "1001" },
        vendor: { legacy_id: "101" },
      })
      expect(pipe.images).toHaveLength(2)
      expect(pipe.thumbnail).toBe(pipe.images[0].url)
      expect(pipe.tags.map((t) => t.value).sort()).toEqual(["pipe", "steel"])
      expect(pipe.sales_channels!.map((c) => c!.name).sort()).toEqual(["Retail", "Wholesale"])
      // Same sha → same uploaded file; missing image just left out.
      expect(sheet.images.map((i) => i.url)).toEqual([pipe.images.find((i) => i.url === byLegacy["101"].logo)!.url])
      expect(sheet).toMatchObject({ description: "<p>Sheet</p>", variants: [{ sku: null }], product_extra: { min_qty: null } })
      expect(pot).toMatchObject({ status: "proposed", vendor: { legacy_id: "102" } })

      const second = await run()
      expect(second.vendors).toMatchObject({ created: 0, updated: 0, unchanged: 2, owner_users_created: 0 })
      expect(second.products).toMatchObject({ created: 0, updated: 0, unchanged: 3 })
      expect(second.images).toMatchObject({ uploaded: 0, already_uploaded: 2 })

      const file = join(dir, "products.json")
      const rows = JSON.parse(readFileSync(file, "utf8"))
      rows[0].title = "Fixture steel pipe v2"
      rows[0].regular_price = 13
      writeFileSync(file, JSON.stringify(rows))
      const third = await run()
      expect(third.products).toMatchObject({ created: 0, updated: 1, unchanged: 2 })
      const after = await products()
      expect(after).toHaveLength(3)
      expect(after[1]).toMatchObject({ title: "Fixture steel pipe v2", variants: [{ sku: "FX-1", prices: [{ amount: 13 }] }] })
      expect(readFileSync(join(dir, "import-report.md"), "utf8")).toContain("| updated | 1 |")
    })
  },
})
