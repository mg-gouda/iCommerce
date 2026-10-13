import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { CreateProductWorkflowInputDTO, ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow, uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { companySvc, syncCompanyGroups } from "../lib/company"
import { syncProduct } from "../lib/search"
import { setTiers } from "../lib/wholesale"
import { createVendorOption, ensureVendorShipping, listVendorOptions } from "../lib/vendor-shipping"
import { salesChannelsFor } from "../api/vendors/products/helpers"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"
import { createVendorProductWorkflow, type ProductExtraInput } from "../workflows/vendor-products"

// DEMO DATA ONLY — fake suppliers/products for local dev + E2E. Never run against staging/prod.
// medusa exec ./src/scripts/seed-demo.ts — idempotent: categories/vendors/products matched by handle, existing ones skipped.
// Run after seed-defaults (needs Retail/Wholesale sales channels).

const CATEGORIES = [
  { name: "Carpets & rugs", handle: "carpets-rugs" },
  { name: "Cookware", handle: "cookware" },
]

const VENDORS = [
  { handle: "demo-nile-looms", name: "Nile Looms (demo)", city: "Fayoum", image: "kilim-rug.jpg", category: "carpets-rugs" },
  { handle: "demo-helwan-metal", name: "Helwan Metalworks (demo)", city: "Helwan", image: "aluminum-pots.jpg", category: "cookware" },
]

type P = { title: string; price: number; compareAt?: number; extra: ProductExtraInput }
const PRODUCTS: Record<string, P[]> = {
  "demo-nile-looms": [
    { title: "Kilim wool rug, Mamlouky pattern, 1.5 × 2 m", price: 152, compareAt: 179, extra: { unit: "piece", hs_code: "5702.10" } },
    { title: "Hand-woven kilim runner, 0.7 × 2.5 m", price: 64, extra: { unit: "piece", hs_code: "5702.10" } },
    { title: "Cotton rag rug, 1 × 1.5 m", price: 22, extra: { unit: "piece", hs_code: "5702.99" } },
    { title: "Wool kilim, Bedouin stripe, 2 × 3 m", price: 9.4, extra: { unit: "m2", min_qty: 50, qty_step: 10, hs_code: "5702.10", b2b_only: true } },
    { title: "Kilim cushion cover, 45 × 45 cm", price: 11, extra: { unit: "piece", min_qty: 1, max_qty: 20, hs_code: "6304.93" } },
    { title: "Prayer rug, hand-knotted wool", price: 7.2, extra: { unit: "piece", min_qty: 200, qty_step: 50, hs_code: "5701.10", b2b_only: true } },
  ],
  "demo-helwan-metal": [
    { title: "Set of 4 Czech pots with lids, aluminum, 18–26 cm", price: 14.9, extra: { unit: "set", hs_code: "7615.10" } },
    { title: "Aluminum frying pan, 28 cm", price: 8.5, compareAt: 10, extra: { unit: "piece", hs_code: "7615.10" } },
    { title: "Aluminum stock pot, 40 L", price: 31, extra: { unit: "piece", hs_code: "7615.10" } },
    { title: "Czech pot sets, carton of 4, wholesale", price: 11.1, extra: { unit: "set", min_qty: 200, qty_step: 50, hs_code: "7615.10", b2b_only: true } },
    { title: "Aluminum baking tray, 40 × 30 cm", price: 4.2, extra: { unit: "piece", min_qty: 1, max_qty: 50, hs_code: "7615.10" } },
    { title: "Aluminum sheet, 1 mm, mill finish", price: 3150, extra: { unit: "ton", min_qty: 5, hs_code: "7606.11", b2b_only: true } },
  ],
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export default async function seedDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const product = container.resolve(Modules.PRODUCT)
  const vendors: VendorModuleService = container.resolve(VENDOR_MODULE)

  const have = await product.listProductCategories({ handle: CATEGORIES.map((c) => c.handle) }, { select: ["id", "handle"] })
  const missing = CATEGORIES.filter((c) => !have.some((h) => h.handle === c.handle))
  if (missing.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: missing.map((c) => ({ ...c, is_active: true, metadata: { demo: true } })) },
    })
    have.push(...result)
  }
  const catId = new Map(have.map((c) => [c.handle, c.id]))

  // Sample photos from the design system; uploaded once per run, only when a product is created.
  const imageUrl = new Map<string, string>()
  async function image(file: string) {
    if (!imageUrl.has(file)) {
      const content = readFileSync(resolve(process.cwd(), "../../design-system/assets/Samples", file)).toString("base64")
      const { result } = await uploadFilesWorkflow(container).run({
        input: { files: [{ filename: file, mimeType: "image/jpeg", content, access: "public" }] },
      })
      imageUrl.set(file, result[0].url)
    }
    return imageUrl.get(file)!
  }

  let created = 0
  for (const v of VENDORS) {
    let [vendor] = await vendors.listVendors({ handle: v.handle })
    if (!vendor) {
      vendor = await vendors.createVendors({
        name: v.name,
        handle: v.handle,
        city: v.city,
        country: "EG",
        description: "Demo supplier for local development. Not a real company.",
        status: "approved",
        kyc_status: "verified",
      })
    }
    // One flat option per demo vendor so checkout works end to end.
    const { shipping_profile_id } = await ensureVendorShipping(container, vendor)
    if (!(await listVendorOptions(container, shipping_profile_id)).length) {
      await createVendorOption(container, vendor, { name: "Standard delivery (2–4 days)", kind: "flat", amount: 5 })
    }
    for (const p of PRODUCTS[v.handle]) {
      const handle = `demo-${slug(p.title)}`
      if ((await product.listProducts({ handle }, { select: ["id"] })).length) continue
      const url = await image(v.image)
      const extra = { origin_country: "EG", ...p.extra }
      const { result } = await createVendorProductWorkflow(container).run({
        input: {
          vendor_id: vendor.id,
          extra,
          product: {
            title: p.title,
            handle,
            description: `${p.title}. Demo listing, not for sale.`,
            status: "published",
            thumbnail: url,
            images: [{ url }],
            categories: [{ id: catId.get(v.category)! }],
            metadata: { demo: true, ...(p.compareAt && { compare_at_usd: p.compareAt }) },
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              { title: "Default", options: { Default: "Default" }, manage_inventory: false, prices: [{ currency_code: "usd", amount: p.price }] },
            ],
            sales_channels: await salesChannelsFor(container, extra),
            shipping_profile_id,
          } as CreateProductWorkflowInputDTO,
        },
      })
      await syncProduct(container, result.id)
      created++
    }
  }
  logger.info(`seed-demo: ${created} demo products created (${VENDORS.length} demo vendors)`)
  await seedDemoB2b(container)
}

// Wholesale tiers (by product handle) + one verified demo company. Login: <email> / DemoPass1!
const TIERS: Record<string, { min_qty: number; unit_price_usd: number }[]> = {
  "demo-czech-pot-sets-carton-of-4-wholesale": [{ min_qty: 200, unit_price_usd: 10.6 }, { min_qty: 1000, unit_price_usd: 9.9 }],
  "demo-wool-kilim-bedouin-stripe-2-3-m": [{ min_qty: 100, unit_price_usd: 8.9 }, { min_qty: 500, unit_price_usd: 8.2 }],
  "demo-aluminum-frying-pan-28-cm": [{ min_qty: 50, unit_price_usd: 7.4 }, { min_qty: 200, unit_price_usd: 6.9 }],
}
const DEMO_COMPANY = { handle: "demo-delta-trading", name: "Delta Trading (demo)", country: "EG", city: "Alexandria", address: "Demo St 1", phone: "+20 100 000 0000" }
const DEMO_MEMBERS = [
  { email: "demo-buyer-admin@icommerce.test", first_name: "Demo", last_name: "Admin", role: "admin" as const },
  { email: "demo-approver@icommerce.test", first_name: "Demo", last_name: "Approver", role: "approver" as const },
]

async function seedDemoB2b(container: ExecArgs["container"]) {
  const product = container.resolve(Modules.PRODUCT)
  for (const [handle, tiers] of Object.entries(TIERS)) {
    const [p] = await product.listProducts({ handle }, { select: ["id"] })
    if (p) await setTiers(container, p.id, tiers)
  }
  const svc = companySvc(container)
  let [company] = await svc.listCompanies({ handle: DEMO_COMPANY.handle })
  if (!company) {
    company = await svc.createCompanies({ ...DEMO_COMPANY, tax_id: "DEMO-TAX", commercial_reg_no: "DEMO-CR", kyc_status: "verified", verified_at: new Date(), payment_mode: "net_terms" })
  }
  const customers = container.resolve(Modules.CUSTOMER)
  const auth = container.resolve(Modules.AUTH)
  for (const m of DEMO_MEMBERS) {
    let [c] = await customers.listCustomers({ email: m.email })
    if (!c) {
      c = await customers.createCustomers({ email: m.email, first_name: m.first_name, last_name: m.last_name, has_account: true, metadata: { locale: "en", demo: true } })
      const { authIdentity } = await auth.register("emailpass", { body: { email: m.email, password: "DemoPass1!" } } as never)
      await auth.updateAuthIdentities({ id: authIdentity!.id, app_metadata: { customer_id: c.id } })
    }
    if (!(await svc.listCompanyMembers({ customer_id: c.id })).length) {
      await svc.createCompanyMembers({ company_id: company.id, customer_id: c.id, email: m.email, first_name: m.first_name, last_name: m.last_name, role: m.role })
    }
  }
  if (!(await svc.listCreditAccounts({ company_id: company.id })).length) {
    await svc.createCreditAccounts({ company_id: company.id, limit_usd: 50000, terms_days: 30 })
  }
  await syncCompanyGroups(container, company.id)
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`seed-demo: demo company ${DEMO_COMPANY.handle} (verified, net 30, USD 50k); logins ${DEMO_MEMBERS.map((m) => m.email).join(", ")} / DemoPass1!`)
}
