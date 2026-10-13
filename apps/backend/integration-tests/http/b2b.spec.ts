import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import seedDefaults from "../../src/scripts/seed-defaults"
import { flagOverdue } from "../../src/lib/net-terms"
import { expireQuotes } from "../../src/lib/quotes"
import { COMPANY_MODULE } from "../../src/modules/company"
import { QUOTE_MODULE } from "../../src/modules/quote"
import type QuoteModuleService from "../../src/modules/quote/service"
import type CompanyModuleService from "../../src/modules/company/service"

jest.setTimeout(300 * 1000)

const EMAILS = mkdtempSync(join(tmpdir(), "icommerce-b2b-emails-"))
process.env.EMAILS_DIR = EMAILS

const PASSWORD = "Passw0rd!"
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const emails = () => readdirSync(EMAILS)
const status = (n: number) => ({ response: { status: n } })
const day = 86_400_000

type Extra = { min_qty?: number; qty_step?: number; max_qty?: number; unit?: string }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let admin: string
    let retail: string
    let wholesale: string
    const auth = (token?: string, key = retail) => ({ headers: { "x-publishable-api-key": key, ...(token && { authorization: `Bearer ${token}` }) } })

    beforeEach(async () => {
      await seedDefaults({ container: getContainer(), args: [] } as never)
      const keys = getContainer().resolve(Modules.API_KEY)
      retail = (await keys.listApiKeys({ title: "Retail storefront" }))[0].token
      wholesale = (await keys.listApiKeys({ title: "Wholesale storefront" }))[0].token
      const email = "admin@test.com"
      const reg = await api.post("/auth/user/emailpass/register", { email, password: PASSWORD })
      const user = await getContainer().resolve(Modules.USER).createUsers({ email })
      await getContainer().resolve(Modules.AUTH).updateAuthIdentities({ id: claims(reg.data.token).auth_identity_id, app_metadata: { user_id: user.id } })
      admin = (await api.post("/auth/user/emailpass", { email, password: PASSWORD })).data.token
    })

    async function vendor(name: string, products: { price: number; extra?: Extra }[]) {
      const email = `${name.toLowerCase()}@vendor.test`
      const reg = await api.post("/auth/vendor/emailpass/register", { email, password: PASSWORD })
      const { data } = await api.post("/vendors", { name, country: "EG" }, auth(reg.data.token))
      await api.post(`/admin/vendors/${data.vendor.id}/approve`, {}, auth(admin))
      const token = (await api.post("/auth/vendor/emailpass", { email, password: PASSWORD })).data.token as string
      const out: { product_id: string; variant_id: string }[] = []
      for (const [i, p] of products.entries()) {
        const r = await api.post(
          "/vendors/products",
          {
            title: `${name} item ${i}`,
            status: "published",
            options: [{ title: "Default", values: ["Default"] }],
            variants: [{ title: "Default", options: { Default: "Default" }, manage_inventory: false, prices: [{ currency_code: "usd", amount: p.price }] }],
            ...(p.extra && { extra: p.extra }),
          },
          auth(token),
        )
        out.push({ product_id: r.data.product.id, variant_id: r.data.product.variants[0].id })
      }
      await api.post("/vendors/shipping-options", { name: `${name} courier`, kind: "flat", amount: 5 }, auth(token))
      return { id: data.vendor.id as string, token, products: out }
    }

    async function customer(name: string, locale = "en") {
      const email = `${name}@buyer.test`
      const reg = await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })
      const c = await api.post("/store/customers", { email, first_name: name, last_name: "Buyer", metadata: { locale } }, auth(reg.data.token))
      return { email, id: c.data.customer.id as string, token: (await api.post("/auth/customer/emailpass", { email, password: PASSWORD })).data.token as string }
    }

    const kycForm = () => {
      const f = new FormData()
      f.append("tax_id", "TAX-1")
      f.append("commercial_reg_no", "CR-1")
      f.append("files", new Blob(["%PDF-1.4 cr"], { type: "application/pdf" }), "cr.pdf")
      return f
    }

    /** Company with admin (+ invited members), KYC submitted, optionally verified by admin. */
    async function company(name: string, members: { name: string; role: "buyer" | "approver" | "admin" }[] = [], verify = true) {
      const owner = await customer(`${name}-admin`, "ar")
      const created = await api.post("/store/companies", { name: `${name} Imports`, country: "eg", city: "Cairo", address: "1 Nile St", phone: "+20100" }, auth(owner.token))
      expect(created.status).toBe(201)
      const out: Record<string, Awaited<ReturnType<typeof customer>>> = { admin: owner }
      for (const m of members) {
        const c = await customer(m.name)
        await api.post("/store/companies/me/invitations", { email: c.email, role: m.role }, auth(owner.token))
        const file = emails().find((f) => f.includes("company-invite") && f.includes(c.email))!
        const token = readFileSync(join(EMAILS, file), "utf8").match(/token=([\w-]+)/)![1]
        const joined = await api.post("/store/companies/invitations/accept", { token }, auth(c.token))
        expect(joined.data.member.role).toBe(m.role)
        out[m.name] = c
      }
      await api.post("/store/companies/me/kyc", kycForm(), auth(owner.token))
      if (verify) await api.post(`/admin/companies/${created.data.company.id}/verify`, {}, auth(admin))
      return { id: created.data.company.id as string, members: out }
    }

    async function cart(token: string, key: string, lines: { variant_id: string; quantity: number }[]) {
      const region = (await api.get("/store/regions", auth(undefined, key))).data.regions.find((r: { name: string }) => r.name === "Egypt")
      const c = (await api.post("/store/carts", { region_id: region.id }, auth(token, key))).data.cart
      for (const l of lines) await api.post(`/store/carts/${c.id}/line-items`, l, auth(token, key))
      return c.id as string
    }

    async function checkout(token: string, key: string, cartId: string, provider_id: string) {
      await api.post(
        `/store/carts/${cartId}`,
        { shipping_address: { first_name: "Sara", last_name: "N.", address_1: "1 Nile St", city: "Giza", country_code: "eg", phone: "+20100" } },
        auth(token, key),
      )
      const groups = (await api.get(`/store/carts/${cartId}/vendor-groups`, auth(token, key))).data.vendor_groups
      for (const g of groups) await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: g.shipping_options[0].id }, auth(token, key))
      const pc = (await api.post("/store/payment-collections", { cart_id: cartId }, auth(token, key))).data.payment_collection
      await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id }, auth(token, key))
      return api.post(`/store/carts/${cartId}/complete`, {}, auth(token, key))
    }

    async function waitFor<T>(fn: () => Promise<T | undefined | null | false>) {
      for (let i = 0; i < 60; i++) {
        const v = await fn()
        if (v) return v
        await sleep(200)
      }
      throw new Error("timeout")
    }
    const childIds = (order_id: string) =>
      waitFor(async () => (await getContainer().resolve(Modules.ORDER).retrieveOrder(order_id, { select: ["metadata"] })).metadata?.vendor_order_ids as string[])

    it("company → KYC → verify → tier prices in wholesale cart, MOQ, members, gating", async () => {
      const v = await vendor("Helwan", [{ price: 10, extra: { min_qty: 10, qty_step: 5, max_qty: 500, unit: "set" } }])
      const [p] = v.products
      const owner = await customer("owner", "ar")
      const stranger = await customer("stranger")

      await expect(api.get("/store/companies/me", auth(owner.token))).rejects.toMatchObject(status(404))
      const created = await api.post("/store/companies", { name: "Delta Imports", country: "eg", city: "Cairo" }, auth(owner.token))
      expect(created.data.company).toMatchObject({ handle: "delta-imports", country: "EG", kyc_status: "none", payment_mode: "upfront" })
      expect(created.data.member).toMatchObject({ role: "admin", email: owner.email })
      await expect(api.post("/store/companies", { name: "Again", country: "EG" }, auth(owner.token))).rejects.toMatchObject(status(400))
      await expect(api.get("/store/companies/me", auth())).rejects.toMatchObject(status(401))

      // Invitation: token only in the email; wrong customer can't use it.
      const buyer = await customer("buyer")
      const inv = await api.post("/store/companies/me/invitations", { email: buyer.email, role: "buyer" }, auth(owner.token))
      expect(inv.status).toBe(201)
      expect(inv.data.invitation.token).toBeUndefined()
      const file = emails().find((f) => f.includes("company-invite") && f.includes(buyer.email))!
      const html = readFileSync(join(EMAILS, file), "utf8")
      expect(html).toContain('dir="rtl"') // inviter's locale
      const token = html.match(/token=([\w-]+)/)![1]
      await expect(api.post("/store/companies/invitations/accept", { token }, auth(stranger.token))).rejects.toMatchObject(status(400))
      await api.post("/store/companies/invitations/accept", { token }, auth(buyer.token))
      await expect(api.post("/store/companies/invitations/accept", { token }, auth(buyer.token))).rejects.toMatchObject(status(400))
      const team = (await api.get("/store/companies/me/members", auth(buyer.token))).data
      expect(team.members.map((m: { role: string }) => m.role)).toEqual(["admin", "buyer"])
      expect(team.invitations).toEqual([])
      await expect(api.post("/store/companies/me/invitations", { email: "x@y.test", role: "buyer" }, auth(buyer.token))).rejects.toMatchObject(status(403))
      const ownerMember = team.members.find((m: { role: string }) => m.role === "admin")
      await expect(api.post(`/store/companies/me/members/${ownerMember.id}`, { role: "buyer" }, auth(owner.token))).rejects.toMatchObject(status(400))

      // KYC (admin only, private files).
      await expect(api.post("/store/companies/me/kyc", kycForm(), auth(buyer.token))).rejects.toMatchObject(status(403))
      const kyc = (await api.post("/store/companies/me/kyc", kycForm(), auth(owner.token))).data.company
      expect(kyc).toMatchObject({ kyc_status: "submitted", tax_id: "TAX-1", commercial_reg_no: "CR-1", export_card_no: null })
      const listed = (await api.get("/admin/companies?kyc_status=submitted", auth(admin))).data
      expect(listed.companies.map((c: { id: string }) => c.id)).toContain(kyc.id)
      const dl = await api.get(`/admin/companies/${kyc.id}/kyc-files/${encodeURIComponent(kyc.kyc_files[0].id)}`, auth(admin))
      expect(dl.status).toBe(200)

      // Vendor tiers + validation + isolation.
      const other = await vendor("Nile", [{ price: 3 }])
      const bad = [
        { tiers: [{ min_qty: 50, unit_price_usd: 8 }, { min_qty: 20, unit_price_usd: 9 }] },
        { tiers: [{ min_qty: 20, unit_price_usd: 8 }, { min_qty: 50, unit_price_usd: 9 }] },
      ]
      for (const b of bad) await expect(api.put(`/vendors/products/${p.product_id}/wholesale-tiers`, b, auth(v.token))).rejects.toMatchObject(status(400))
      await expect(api.put(`/vendors/products/${p.product_id}/wholesale-tiers`, { tiers: [] }, auth(other.token))).rejects.toMatchObject(status(404))
      const tiers = [{ min_qty: 20, unit_price_usd: 9 }, { min_qty: 50, unit_price_usd: 8 }]
      expect((await api.put(`/vendors/products/${p.product_id}/wholesale-tiers`, { tiers }, auth(v.token))).data.tiers).toEqual(tiers)
      expect((await api.get(`/vendors/products/${p.product_id}/wholesale-tiers`, auth(v.token))).data.tiers).toEqual(tiers)

      // Not verified yet → gated.
      expect((await api.get(`/store/products/${p.product_id}/wholesale-tiers`, auth(owner.token))).data).toEqual({ tiers: null, gated: true })
      expect((await api.get(`/store/products/${p.product_id}/wholesale-tiers`, auth())).data).toEqual({ tiers: null, gated: true })

      await expect(api.post(`/admin/companies/${kyc.id}/reject`, {}, auth(admin))).rejects.toMatchObject(status(400))
      const verified = (await api.post(`/admin/companies/${kyc.id}/verify`, {}, auth(admin))).data.company
      expect(verified.kyc_status).toBe("verified")
      expect(emails().some((f) => f.includes("company-verified") && f.includes(owner.email))).toBe(true)
      expect((await api.get(`/store/products/${p.product_id}/wholesale-tiers`, auth(buyer.token))).data).toEqual({ tiers, gated: false })
      const batch = `/store/products/wholesale-tiers?ids=${p.product_id},${other.products[0].product_id}`
      expect((await api.get(batch, auth(buyer.token))).data).toEqual({ tiers: { [p.product_id]: tiers, [other.products[0].product_id]: [] }, gated: false })
      expect((await api.get(batch, auth(stranger.token))).data).toEqual({ tiers: null, gated: true })
      await expect(api.get("/store/products/wholesale-tiers?ids=", auth(buyer.token))).rejects.toMatchObject(status(400))

      // Wholesale cart: MOQ grid enforced, tier price by quantity.
      const wc = await cart(buyer.token, wholesale, [])
      for (const quantity of [5, 12, 505]) {
        await expect(api.post(`/store/carts/${wc}/line-items`, { variant_id: p.variant_id, quantity }, auth(buyer.token, wholesale))).rejects.toMatchObject(status(400))
      }
      let c = (await api.post(`/store/carts/${wc}/line-items`, { variant_id: p.variant_id, quantity: 10 }, auth(buyer.token, wholesale))).data.cart
      expect(c.items[0]).toMatchObject({ quantity: 10, unit_price: 10 }) // below first tier → list price
      await expect(api.post(`/store/carts/${wc}/line-items`, { variant_id: p.variant_id, quantity: 3 }, auth(buyer.token, wholesale))).rejects.toMatchObject(status(400))
      c = (await api.post(`/store/carts/${wc}/line-items/${c.items[0].id}`, { quantity: 20 }, auth(buyer.token, wholesale))).data.cart
      expect(c.items[0]).toMatchObject({ quantity: 20, unit_price: 9 })
      c = (await api.post(`/store/carts/${wc}/line-items`, { variant_id: p.variant_id, quantity: 30 }, auth(buyer.token, wholesale))).data.cart
      expect(c.items[0]).toMatchObject({ quantity: 50, unit_price: 8 })
      await expect(api.post(`/store/carts/${wc}/line-items/${c.items[0].id}`, { quantity: 52 }, auth(buyer.token, wholesale))).rejects.toMatchObject(status(400))

      // Retail cart: no tiers, no server MOQ. Non-member wholesale cart: list price.
      const rc = await cart(buyer.token, retail, [{ variant_id: p.variant_id, quantity: 50 }])
      expect((await api.get(`/store/carts/${rc}`, auth(buyer.token))).data.cart.items[0].unit_price).toBe(10)
      const sc = await cart(stranger.token, wholesale, [{ variant_id: p.variant_id, quantity: 50 }])
      expect((await api.get(`/store/carts/${sc}`, auth(stranger.token, wholesale))).data.cart.items[0].unit_price).toBe(10)

      // Contract price list (admin API) beats nothing below tiers for this company only.
      const contract = await api.post(`/admin/companies/${kyc.id}/price-list`, { prices: [{ variant_id: p.variant_id, amount: 7 }] }, auth(admin))
      expect(contract.data.count).toBe(1)
      const cc = await cart(buyer.token, wholesale, [{ variant_id: p.variant_id, quantity: 10 }])
      expect((await api.get(`/store/carts/${cc}`, auth(buyer.token, wholesale))).data.cart.items[0].unit_price).toBe(7)

      // Member removal + reject drop the group.
      const buyerMember = team.members.find((m: { role: string }) => m.role === "buyer")
      await api.delete(`/store/companies/me/members/${buyerMember.id}`, auth(owner.token))
      expect((await api.get(`/store/products/${p.product_id}/wholesale-tiers`, auth(buyer.token))).data.gated).toBe(true)
      await expect(api.get("/store/companies/me", auth(buyer.token))).rejects.toMatchObject(status(404))
      expect((await api.get(`/store/products/${p.product_id}/wholesale-tiers`, auth(owner.token))).data.gated).toBe(false)
      await api.post(`/admin/companies/${kyc.id}/reject`, { note: "Tax card expired" }, auth(admin))
      expect((await api.get(`/store/products/${p.product_id}/wholesale-tiers`, auth(owner.token))).data.gated).toBe(true)
    })

    it("RFQ → 2 quotes → offer/counter/re-offer → approval → vendor order (decimal qty); isolation; expiry", async () => {
      const v1 = await vendor("Alpha", [{ price: 12, extra: { unit: "t", min_qty: 0.5, qty_step: 0.5 } }])
      const v2 = await vendor("Beta", [{ price: 4 }])
      const co = await company("delta", [{ name: "sara", role: "buyer" }, { name: "omar", role: "approver" }])
      const other = await company("gamma")
      const pending = await company("theta", [], false)
      const { sara, omar } = co.members

      const rfqBody = {
        notes: "Export packing please",
        incoterm: "FOB",
        items: [
          { variant_id: v1.products[0].variant_id, quantity: 800.5, target_price: 10.5 },
          { product_id: v2.products[0].product_id, quantity: 100 },
          { title: "Custom tray 50×40", vendor_id: v2.id, quantity: 3, unit: "piece" },
        ],
      }
      await expect(api.post("/store/quotes", rfqBody, auth(pending.members.admin.token))).rejects.toMatchObject(status(400))
      await expect(api.post("/store/quotes", { items: [{ quantity: 1.0001, title: "x", vendor_id: v2.id }] }, auth(sara.token))).rejects.toMatchObject(status(400))
      const rfq = (await api.post("/store/quotes", rfqBody, auth(sara.token))).data
      expect(rfq.quotes).toHaveLength(2)
      expect(new Set(rfq.quotes.map((q: { rfq_id: string }) => q.rfq_id))).toEqual(new Set([rfq.rfq_id]))
      const q1 = rfq.quotes.find((q: { vendor: { id: string } }) => q.vendor.id === v1.id)
      const q2 = rfq.quotes.find((q: { vendor: { id: string } }) => q.vendor.id === v2.id)
      expect(q1).toMatchObject({ status: "requested", incoterm: "FOB", notes: "Export packing please", requester: { email: sara.email } })
      expect(q1.items).toEqual([expect.objectContaining({ quantity: 800.5, unit: "t", target_price: 10.5, title: "Alpha item 0" })])
      expect(q2.items.map((i: { title: string }) => i.title).sort()).toEqual(["Beta item 0", "Custom tray 50×40"])
      expect(emails().some((f) => f.includes("quote-requested") && f.includes("alpha@vendor.test"))).toBe(true)

      // Isolation: other company, other vendor → 404.
      for (const call of [
        () => api.get(`/store/quotes/${q1.id}`, auth(other.members.admin.token)),
        () => api.post(`/store/quotes/${q1.id}/accept`, {}, auth(other.members.admin.token)),
        () => api.get(`/vendors/quotes/${q1.id}`, auth(v2.token)),
        () => api.post(`/vendors/quotes/${q1.id}/offer`, { items: [], validity_until: new Date(Date.now() + day) }, auth(v2.token)),
        () => api.post(`/vendors/quotes/${q1.id}/messages`, { body: "hi" }, auth(v2.token)),
      ]) {
        await expect(call()).rejects.toMatchObject(status(404))
      }
      expect((await api.get("/store/quotes", auth(other.members.admin.token))).data.count).toBe(0)
      expect((await api.get("/vendors/quotes", auth(v1.token))).data.quotes.map((q: { id: string }) => q.id)).toEqual([q1.id])

      // Vendor opens → vendor_review; offer validation; offer.
      expect((await api.get(`/vendors/quotes/${q1.id}`, auth(v1.token))).data.quote.status).toBe("vendor_review")
      const item = q1.items[0].id
      const until = new Date(Date.now() + 7 * day).toISOString()
      await expect(api.post(`/vendors/quotes/${q1.id}/offer`, { items: [], validity_until: until }, auth(v1.token))).rejects.toMatchObject(status(400))
      await expect(api.post(`/vendors/quotes/${q1.id}/offer`, { items: [{ id: item, offered_unit_price: 11 }], validity_until: new Date(Date.now() - day) }, auth(v1.token))).rejects.toMatchObject(status(400))
      let q = (await api.post(`/vendors/quotes/${q1.id}/offer`, { items: [{ id: item, offered_unit_price: 11.4, lead_time_days: 21 }], validity_until: until, note: "Price for FOB Alexandria" }, auth(v1.token))).data.quote
      expect(q).toMatchObject({ status: "offered", total: 9125.7 })
      expect(emails().some((f) => f.includes("quote-offered") && f.includes(sara.email))).toBe(true)

      // Counter → negotiating → re-offer.
      await expect(api.post(`/vendors/quotes/${q1.id}/offer`, { items: [{ id: item, offered_unit_price: 11 }], validity_until: until }, auth(v1.token))).rejects.toMatchObject(status(400))
      q = (await api.post(`/store/quotes/${q1.id}/counter`, { message: "Can you do 10.8?", items: [{ id: item, target_price: 10.8 }] }, auth(sara.token))).data.quote
      expect(q).toMatchObject({ status: "negotiating", items: [expect.objectContaining({ target_price: 10.8 })] })
      await expect(api.post(`/store/quotes/${q1.id}/counter`, { message: "again" }, auth(sara.token))).rejects.toMatchObject(status(400))
      await expect(api.post(`/store/quotes/${q1.id}/accept`, {}, auth(sara.token))).rejects.toMatchObject(status(400))
      await api.post(`/vendors/quotes/${q1.id}/messages`, { body: "Checking with the factory" }, auth(v1.token))
      q = (await api.post(`/vendors/quotes/${q1.id}/offer`, { items: [{ id: item, offered_unit_price: 11.1, lead_time_days: 25 }], validity_until: until }, auth(v1.token))).data.quote
      expect(q).toMatchObject({ status: "offered", total: 8885.55, items: [expect.objectContaining({ offered_unit_price: 11.1, lead_time_days: 25 })] })

      // Buyer accept → pending approval (company has an approver); buyer can't approve; approver approves → order.
      q = (await api.post(`/store/quotes/${q1.id}/accept`, {}, auth(sara.token))).data.quote
      expect(q.status).toBe("pending_approval")
      expect(emails().some((f) => f.includes("quote-pending-approval") && f.includes(omar.email))).toBe(true)
      await expect(api.post(`/store/quotes/${q1.id}/approve`, {}, auth(sara.token))).rejects.toMatchObject(status(403))
      q = (await api.post(`/store/quotes/${q1.id}/approve`, {}, auth(omar.token))).data.quote
      expect(q).toMatchObject({ status: "ordered", approved_by: expect.stringMatching(/^cmem_/) })
      expect(q.order_id).toMatch(/^order_/)
      expect(q.messages.filter((m: { author: string }) => m.author === "system").map((m: { body: string }) => m.body)).toEqual([
        "requested", "viewed", "offered", "countered", "offered", "pending_approval", "ordered",
      ])
      expect(q.messages.filter((m: { author: string }) => m.author !== "system").map((m: { author: string }) => m.author)).toEqual(["vendor", "buyer", "vendor"])

      // Parent order (customer = requester) → vendor order with exact decimal qty + offered price.
      const [childId] = await childIds(q.order_id)
      const vo = (await api.get(`/vendors/orders/${childId}`, auth(v1.token))).data.order
      expect(vo.items).toEqual([expect.objectContaining({ quantity: 800.5, unit_price: 11.1, total: 8885.55 })])
      expect(vo).toMatchObject({ total: 8885.55, shipping_total: 0, payment: { provider_id: "pp_bank-transfer_bank-transfer", status: "awaiting" } })
      expect(vo.shipping_address).toMatchObject({ company: "delta Imports", city: "Cairo", country_code: "eg" })
      const view = (await api.get(`/store/orders/${q.order_id}/vendor-orders`, auth(sara.token))).data
      expect(view.vendor_orders).toHaveLength(1)
      await expect(api.get(`/store/orders/${q.order_id}/vendor-orders`, auth(omar.token))).rejects.toMatchObject(status(404))
      // Upfront company → bank transfer; after admin confirms, vendor ships the fractional quantity.
      await expect(api.post(`/vendors/orders/${childId}/fulfill`, { carrier: "X", tracking_number: "1" }, auth(v1.token))).rejects.toMatchObject(status(400))
      await api.post(`/admin/orders/${q.order_id}/confirm-transfer`, {}, auth(admin))
      const shipped = (await api.post(`/vendors/orders/${childId}/fulfill`, { carrier: "Maersk", tracking_number: "MSK1" }, auth(v1.token))).data.order
      expect(shipped.status).toBe("shipped")
      expect(emails().some((f) => f.includes("quote-accepted") && f.includes("alpha@vendor.test"))).toBe(true)

      // Vendor 2 declines; buyer can't accept a rejected quote.
      await expect(api.post(`/vendors/quotes/${q2.id}/reject`, {}, auth(v2.token))).rejects.toMatchObject(status(400))
      expect((await api.post(`/vendors/quotes/${q2.id}/reject`, { note: "No capacity" }, auth(v2.token))).data.quote.status).toBe("rejected")
      await expect(api.post(`/store/quotes/${q2.id}/accept`, {}, auth(sara.token))).rejects.toMatchObject(status(400))
      expect(emails().some((f) => f.includes("quote-rejected") && f.includes(sara.email))).toBe(true)

      // Expiry job.
      const r2 = (await api.post("/store/quotes", { items: [{ variant_id: v2.products[0].variant_id, quantity: 10 }] }, auth(co.members.admin.token))).data
      const q3 = r2.quotes[0]
      await api.post(`/vendors/quotes/${q3.id}/offer`, { items: [{ id: q3.items[0].id, offered_unit_price: 3.5 }], validity_until: new Date(Date.now() + day) }, auth(v2.token))
      await getContainer().resolve<QuoteModuleService>(QUOTE_MODULE).updateQuotes({ id: q3.id, validity_until: new Date(Date.now() - 1000) })
      await expect(api.post(`/store/quotes/${q3.id}/accept`, {}, auth(co.members.admin.token))).rejects.toMatchObject(status(400))
      expect(await expireQuotes(getContainer())).toBe(1)
      expect((await api.get(`/store/quotes/${q3.id}`, auth(sara.token))).data.quote.status).toBe("expired")
      expect((await api.get("/store/quotes?status=expired", auth(sara.token))).data.count).toBe(1)
      expect(await expireQuotes(getContainer())).toBe(0)
    })

    it("net terms: authorize within limit, over-limit refused, overdue blocks, mark-paid releases; quote on credit", async () => {
      const v = await vendor("Gizeh", [{ price: 100 }])
      const [p] = v.products
      const co = await company("kappa")
      const { admin: buyer } = co.members
      const outsider = await customer("outsider")

      // No credit account yet → refused.
      let res = await checkout(buyer.token, wholesale, await cart(buyer.token, wholesale, [{ variant_id: p.variant_id, quantity: 1 }]), "pp_net-terms_net-terms")
        .catch((e) => e.response)
      expect(res).toMatchObject({ status: 400, data: { message: "Net terms not available for this account." } })

      await expect(api.post(`/admin/companies/${co.id}/credit-account`, { limit_usd: 1000, terms_days: 45 }, auth(admin))).rejects.toMatchObject(status(400))
      const acc = (await api.post(`/admin/companies/${co.id}/credit-account`, { limit_usd: 1000, terms_days: 30 }, auth(admin))).data.credit_account
      expect(acc).toMatchObject({ limit_usd: 1000, terms_days: 30, status: "active" })
      await api.post(`/admin/companies/${co.id}`, { payment_mode: "net_terms" }, auth(admin))

      res = await checkout(buyer.token, wholesale, await cart(buyer.token, wholesale, [{ variant_id: p.variant_id, quantity: 5 }]), "pp_net-terms_net-terms")
      expect(res.data.type).toBe("order")
      const order1 = res.data.order
      expect(order1.total).toBe(505)
      const inv1 = await waitFor(async () => (await getContainer().resolve<CompanyModuleService>(COMPANY_MODULE).listInvoices({ order_id: order1.id }))[0])
      expect(Number(inv1.amount)).toBe(505)
      expect(Math.round((+new Date(inv1.due_date) - Date.now()) / day)).toBe(30)
      let credit = (await api.get("/store/companies/me/credit", auth(buyer.token))).data
      expect(credit).toMatchObject({ used: 505, available: 495, credit_account: { limit_usd: 1000 }, invoices: [expect.objectContaining({ status: "open", amount: 505 })] })

      res = await checkout(buyer.token, wholesale, await cart(buyer.token, wholesale, [{ variant_id: p.variant_id, quantity: 5 }]), "pp_net-terms_net-terms").catch((e) => e.response)
      expect(res).toMatchObject({ status: 400, data: { message: "Credit limit exceeded: available USD 495.00." } })
      res = await checkout(outsider.token, wholesale, await cart(outsider.token, wholesale, [{ variant_id: p.variant_id, quantity: 1 }]), "pp_net-terms_net-terms").catch((e) => e.response)
      expect(res.status).toBe(400)

      // Quote on credit (net_terms company, admin accepts directly — no approvers).
      const rfq = (await api.post("/store/quotes", { items: [{ variant_id: p.variant_id, quantity: 2 }] }, auth(buyer.token))).data
      const qid = rfq.quotes[0].id
      await api.post(`/vendors/quotes/${qid}/offer`, { items: [{ id: rfq.quotes[0].items[0].id, offered_unit_price: 90 }], validity_until: new Date(Date.now() + day) }, auth(v.token))
      const q = (await api.post(`/store/quotes/${qid}/accept`, {}, auth(buyer.token))).data.quote
      expect(q.status).toBe("ordered")
      await waitFor(async () => (await getContainer().resolve<CompanyModuleService>(COMPANY_MODULE).listInvoices({ order_id: q.order_id }))[0])
      const [child] = await childIds(q.order_id)
      expect((await api.get(`/vendors/orders/${child}`, auth(v.token))).data.order.payment.provider_id).toBe("pp_net-terms_net-terms")
      expect((await api.get("/store/companies/me/credit", auth(buyer.token))).data.used).toBe(685)

      // Overdue → on hold, reminder, blocked.
      await getContainer().resolve<CompanyModuleService>(COMPANY_MODULE).updateInvoices({ id: inv1.id, due_date: new Date(Date.now() - day) })
      expect(await flagOverdue(getContainer())).toEqual({ flagged: 1, overdue: 1 })
      credit = (await api.get("/store/companies/me/credit", auth(buyer.token))).data
      expect(credit.credit_account.status).toBe("on_hold")
      expect(emails().some((f) => f.includes("invoice-overdue") && f.includes(buyer.email))).toBe(true)
      res = await checkout(buyer.token, wholesale, await cart(buyer.token, wholesale, [{ variant_id: p.variant_id, quantity: 1 }]), "pp_net-terms_net-terms").catch((e) => e.response)
      expect(res.status).toBe(400)

      // Mark paid → captured, released, account active again.
      const list = (await api.get(`/admin/invoices?company_id=${co.id}&status=overdue`, auth(admin))).data
      expect(list.invoices).toEqual([expect.objectContaining({ id: inv1.id, company: { id: co.id, name: "kappa Imports" } })])
      const paid = (await api.post(`/admin/invoices/${inv1.id}/mark-paid`, {}, auth(admin))).data.invoice
      expect(paid.status).toBe("paid")
      await expect(api.post(`/admin/invoices/${inv1.id}/mark-paid`, {}, auth(admin))).rejects.toMatchObject(status(400))
      const { data: [o] } = await getContainer().resolve("query").graph({ entity: "order", fields: ["payment_collections.payments.captures.amount"], filters: { id: order1.id } })
      expect(o.payment_collections?.[0]?.payments?.[0]?.captures?.map((c) => Number(c?.amount))).toEqual([505])
      credit = (await api.get("/store/companies/me/credit", auth(buyer.token))).data
      expect(credit).toMatchObject({ used: 180, available: 820, credit_account: { status: "active" } })
      res = await checkout(buyer.token, wholesale, await cart(buyer.token, wholesale, [{ variant_id: p.variant_id, quantity: 1 }]), "pp_net-terms_net-terms")
      expect(res.data.type).toBe("order")
      await childIds(res.data.order.id) // let the async split finish before teardown
    })
  },
})
