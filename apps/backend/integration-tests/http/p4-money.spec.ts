import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import seedDefaults from "../../src/scripts/seed-defaults"
import { computeFee, feeSvc } from "../../src/lib/fees"
import { releaseAvailable } from "../../src/lib/ledger"
import { flagPastDue, planSvc } from "../../src/lib/plans"

jest.setTimeout(600 * 1000)

const EMAILS = mkdtempSync(join(tmpdir(), "icommerce-p4-emails-"))
process.env.EMAILS_DIR = EMAILS

const PASSWORD = "Passw0rd!"
const DAY = 86_400_000
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const status = (n: number) => ({ response: { status: n } })
const emails = () => readdirSync(EMAILS)
const c = (n: number) => Math.round(n * 100 + 1e-7) // cents
const pct = (cents: number, p: number) => Math.round((cents * p) / 100 + 1e-7)
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const COD = "pp_cod_cod"
const BANK = "pp_bank-transfer_bank-transfer"
const NET = "pp_net-terms_net-terms"

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

    const planId = async (handle: string) => (await api.get("/admin/plans", auth(admin))).data.plans.find((p: Row) => p.handle === handle).id as string

    /** Approved vendor + products (published) + one flat shipping option (5). plan: handle or null = Starter (no row). */
    async function vendor(name: string, prices: number[], plan: string | null = "business") {
      const email = `${name.toLowerCase()}@vendor.test`
      const reg = await api.post("/auth/vendor/emailpass/register", { email, password: PASSWORD })
      const { data } = await api.post("/vendors", { name, country: "EG" }, auth(reg.data.token))
      await api.post(`/admin/vendors/${data.vendor.id}/approve`, {}, auth(admin))
      if (plan) await api.post("/admin/vendor-subscriptions", { vendor_id: data.vendor.id, plan_id: await planId(plan) }, auth(admin))
      const token = (await api.post("/auth/vendor/emailpass", { email, password: PASSWORD })).data.token as string
      const products: { product_id: string; variant_id: string }[] = []
      for (const [i, amount] of prices.entries()) {
        const r = await api.post(
          "/vendors/products",
          {
            title: `${name} item ${i}`, status: "published",
            options: [{ title: "Default", values: ["Default"] }],
            variants: [{ title: "Default", options: { Default: "Default" }, manage_inventory: false, prices: [{ currency_code: "usd", amount }] }],
          },
          auth(token),
        )
        products.push({ product_id: r.data.product.id, variant_id: r.data.product.variants[0].id })
      }
      await api.post("/vendors/shipping-options", { name: `${name} courier`, kind: "flat", amount: 5 }, auth(token))
      return { id: data.vendor.id as string, token, products, variants: products.map((p) => p.variant_id) }
    }

    async function customer(name: string, locale = "en") {
      const email = `${name}@buyer.test`
      const reg = await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })
      const r = await api.post("/store/customers", { email, first_name: name, last_name: "Buyer", metadata: { locale } }, auth(reg.data.token))
      return { email, id: r.data.customer.id as string, token: (await api.post("/auth/customer/emailpass", { email, password: PASSWORD })).data.token as string }
    }

    /** Verified company (admin + one buyer), optional net-terms credit. */
    async function company(name: string, credit?: number) {
      const owner = await customer(`${name}-admin`)
      const created = await api.post("/store/companies", { name: `${name} Imports`, country: "eg", city: "Cairo", address: "1 Nile St", phone: "+20100" }, auth(owner.token))
      const buyer = await customer(`${name}-buyer`)
      await api.post("/store/companies/me/invitations", { email: buyer.email, role: "buyer" }, auth(owner.token))
      const file = emails().find((f) => f.includes("company-invite") && f.includes(buyer.email))!
      await api.post("/store/companies/invitations/accept", { token: readFileSync(join(EMAILS, file), "utf8").match(/token=([\w-]+)/)![1] }, auth(buyer.token))
      const f = new FormData()
      f.append("tax_id", "TAX-1")
      f.append("commercial_reg_no", "CR-1")
      f.append("files", new Blob(["%PDF-1.4 cr"], { type: "application/pdf" }), "cr.pdf")
      await api.post("/store/companies/me/kyc", f, auth(owner.token))
      const id = created.data.company.id as string
      await api.post(`/admin/companies/${id}/verify`, {}, auth(admin))
      if (credit) {
        await api.post(`/admin/companies/${id}/credit-account`, { limit_usd: credit, terms_days: 30 }, auth(admin))
        await api.post(`/admin/companies/${id}`, { payment_mode: "net_terms" }, auth(admin))
      }
      return { id, owner, buyer }
    }

    async function cart(token: string | undefined, key: string, lines: { variant_id: string; quantity: number }[]) {
      const region = (await api.get("/store/regions", auth(undefined, key))).data.regions.find((r: Row) => r.name === "Egypt")
      const created = (await api.post("/store/carts", { region_id: region.id, ...(!token && { email: "guest@buyer.test" }) }, auth(token, key))).data.cart
      for (const l of lines) await api.post(`/store/carts/${created.id}/line-items`, l, auth(token, key))
      return created.id as string
    }
    const getCart = async (id: string, token?: string, key = retail) =>
      (await api.get(`/store/carts/${id}?fields=*items,+items.metadata,+item_total,+total,+payment_collection.amount`, auth(token, key))).data.cart as Row
    const feeLine = (cart: Row) => (cart.items as Row[]).find((i) => i.metadata?.platform_fee) as Row

    async function pay(token: string | undefined, key: string, id: string, provider_id: string) {
      await prepare(token, key, id, provider_id)
      return api.post(`/store/carts/${id}/complete`, {}, auth(token, key))
    }
    async function prepare(token: string | undefined, key: string, id: string, provider_id: string) {
      await api.post(`/store/carts/${id}`, { shipping_address: { first_name: "Mona", last_name: "A.", address_1: "1 Nile St", city: "Giza", country_code: "eg", phone: "+20100" } }, auth(token, key))
      const groups = (await api.get(`/store/carts/${id}/vendor-groups`, auth(token, key))).data.vendor_groups
      for (const g of groups) await api.post(`/store/carts/${id}/shipping-methods`, { option_id: g.shipping_options[0].id }, auth(token, key))
      const pc = (await api.post("/store/payment-collections", { cart_id: id }, auth(token, key))).data.payment_collection
      await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id }, auth(token, key))
    }

    async function waitFor<T>(fn: () => Promise<T | undefined | null | false>) {
      for (let i = 0; i < 75; i++) {
        const v = await fn()
        if (v) return v
        await sleep(200)
      }
      throw new Error("timeout")
    }
    const childIds = (order_id: string) =>
      waitFor(async () => (await getContainer().resolve(Modules.ORDER).retrieveOrder(order_id, { select: ["metadata"] })).metadata?.vendor_order_ids as string[])

    async function place(token: string | undefined, key: string, lines: { variant_id: string; quantity: number }[], provider: string) {
      const res = await pay(token, key, await cart(token, key, lines), provider)
      expect(res.data.type).toBe("order")
      return { order: res.data.order as Row, children: await childIds(res.data.order.id) }
    }
    /** Vendor order of `v` among `children`. */
    const childOf = async (v: { token: string }, children: string[]) => {
      for (const id of children) {
        const r = await api.get(`/vendors/orders/${id}`, auth(v.token)).catch(() => null)
        if (r) return r.data.order as Row
      }
      throw new Error("no vendor order")
    }
    async function shipAndDeliver(v: { token: string }, id: string) {
      await api.post(`/vendors/orders/${id}/fulfill`, { carrier: "Aramex", tracking_number: "1" }, auth(v.token))
      return (await api.post(`/vendors/orders/${id}/deliver`, {}, auth(v.token))).data.order as Row
    }
    const ledger = async (vendor_id: string) => (await api.get(`/admin/payouts/ledger?vendor_id=${vendor_id}&limit=200`, auth(admin))).data.entries as Row[]
    const sumC = (entries: Row[]) => entries.reduce((s, e) => s + c(e.amount), 0)
    const captures = async (order_id: string) => {
      const { data: [o] } = await getContainer().resolve("query").graph({ entity: "order", fields: ["payment_collections.payments.captures.amount"], filters: { id: order_id } })
      return ((o.payment_collections?.[0]?.payments?.[0]?.captures ?? []) as Row[]).map((x) => Number(x.amount))
    }

    it("fee: tiers per channel, monthly volume, clamps, cart line, completion guard, snapshot", async () => {
      // Pure resolution on the seeded tiers (worked example D + clamps + channels).
      const tiers = (await feeSvc(getContainer()).listFeeTiers({})) as Row[]
      const fee = (ch: "b2b" | "b2c", sub: number, vol = 0) => computeFee(tiers, ch, c(sub), c(vol))?.amount ?? null
      expect(fee("b2b", 6000, 25000)).toBe(250) // ≥30k → 4% = 240 → min 250
      expect(fee("b2b", 150000, 45000)).toBe(4500) // ≥40k → 3%
      expect(fee("b2b", 250000, 45000)).toBe(6000) // 7500 → max
      expect(fee("b2b", 12000)).toBe(720) // ≥10k → 6%
      expect(fee("b2b", 9000, 12000)).toBe(450) // base 21k → 5%
      expect(fee("b2b", 100)).toBe(250) // below 10k = first tier (0 row), min fee
      expect(fee("b2c", 74)).toBe(1.48)
      expect(fee("b2c", 74, 1_000_000)).toBe(1.48) // b2c basis order_total ignores volume
      expect(fee("b2c", 0)).toBeNull()
      expect((await api.get("/admin/fee-tiers/preview?channel=b2b&subtotal=6000&monthly_volume=25000", auth(admin))).data.fee).toMatchObject({ amount: 250, percent: 4, min_amount: 30000, base: 31000 })
      await expect(api.post("/admin/fee-tiers", { channel: "b2c", basis: "order_total", min_amount: 0, percent: 1, min_fee: 9, max_fee: 1, label_en: "x", label_ar: "x" }, auth(admin))).rejects.toMatchObject(status(400))

      // B2C cart: fee line follows every change; payment amount includes it.
      const a = await vendor("Alpha", [10, 20])
      const b = await vendor("Beta", [7])
      const mona = await customer("mona", "ar")
      const id = await cart(mona.token, retail, [...a.variants, ...b.variants].map((variant_id) => ({ variant_id, quantity: 2 })))
      let ct = await getCart(id, mona.token)
      expect(feeLine(ct)).toMatchObject({ unit_price: 1.48, quantity: 1, title: "Service fee", variant_id: null, is_custom_price: true, requires_shipping: false })
      expect(feeLine(ct).metadata.platform_fee).toMatchObject({ amount: 1.48, channel: "b2c", basis: "order_total", percent: 2, subtotal: 74, label_ar: "رسوم الخدمة" })
      expect(ct.item_total).toBe(75.48)
      const line = (ct.items as Row[]).find((i) => i.variant_id === b.variants[0]) as Row
      await api.post(`/store/carts/${id}/line-items/${line.id}`, { quantity: 5 }, auth(mona.token)) // 60 + 35 = 95 → 1.90
      ct = await getCart(id, mona.token)
      expect(feeLine(ct).unit_price).toBe(1.9)
      await api.delete(`/store/carts/${id}/line-items/${feeLine(ct).id}`, auth(mona.token)) // removing it is pointless
      expect(feeLine(await getCart(id, mona.token)).unit_price).toBe(1.9)
      const res = await pay(mona.token, retail, id, COD)
      const order = res.data.order
      expect(order.total).toBe(95 + 10 + 1.9)
      expect((await captures(order.id)).length).toBe(0)
      const { data: [pc] } = await getContainer().resolve("query").graph({ entity: "order", fields: ["payment_collections.amount"], filters: { id: order.id } })
      expect(Number(pc.payment_collections?.[0]?.amount)).toBe(106.9)
      const kids = await childIds(order.id)
      // Fee stays on the parent; vendor orders sum to total − fee; shares split pro rata (60 / 35 of 1.90).
      const [oa, ob] = [await childOf(a, kids), await childOf(b, kids)]
      expect(oa).toMatchObject({ total: 65, fee_share: 1.2, commission_total: 6 })
      expect(ob).toMatchObject({ total: 40, fee_share: 0.7, commission_total: 3.5 })
      expect(oa.items.every((i: Row) => !i.title.includes("fee"))).toBe(true)
      // Buyer view: no vendor-side money; guest status carries the fee.
      const view = (await api.get(`/store/orders/${order.id}/vendor-orders`, auth(mona.token))).data
      expect(view.vendor_orders[0].commission_total).toBeUndefined()
      expect(view.vendor_orders[0].items[0].commission).toBeUndefined()
      const guest = (await api.get(`/store/orders/guest-status?display_id=${order.display_id}&email=${mona.email}`, auth())).data
      expect(guest.order.fee).toMatchObject({ amount: 1.9, label_en: "Service fee" })

      // Snapshot: editing the tier never changes the placed order; new carts use the new rate.
      const b2cTier = tiers.find((t) => t.channel === "b2c")!
      await api.post(`/admin/fee-tiers/${b2cTier.id}`, { percent: 5 }, auth(admin))
      const { data: [after] } = await getContainer().resolve("query").graph({ entity: "order", fields: ["total", "items.unit_price", "items.metadata"], filters: { id: order.id } })
      expect(Number(after.total)).toBe(106.9)
      expect((after.items as Row[]).find((i) => i.metadata?.platform_fee)!.metadata.platform_fee).toMatchObject({ percent: 2, amount: 1.9 })
      expect(feeLine(await getCart(await cart(mona.token, retail, [{ variant_id: a.variants[0], quantity: 1 }]), mona.token)).unit_price).toBe(0.5)

      // Empty cart → no fee line; guests pay the B2C fee too.
      const g = await cart(undefined, retail, [{ variant_id: a.variants[0], quantity: 1 }])
      const gl = feeLine(await getCart(g))
      expect(gl.unit_price).toBe(0.5)
      await api.delete(`/store/carts/${g}/line-items/${(await getCart(g)).items.find((i: Row) => !i.metadata?.platform_fee).id}`, auth())
      expect((await getCart(g)).items).toEqual([])

      // B2B monthly volume is company-wide; completion refuses a stale fee.
      const big = await vendor("Gamma", [1000])
      const co = await company("delta", 100000)
      const stale = await cart(co.owner.token, wholesale, [{ variant_id: big.variants[0], quantity: 9 }])
      expect(feeLine(await getCart(stale, co.owner.token, wholesale)).metadata.platform_fee).toMatchObject({ amount: 540, monthly_volume: 0, min_amount: 0, percent: 6, label_en: "Platform fee" })
      await prepare(co.owner.token, wholesale, stale, NET) // payment session for 9005 + 540
      await place(co.buyer.token, wholesale, [{ variant_id: big.variants[0], quantity: 12 }], NET) // other member: 12k → 720
      const err = await api.post(`/store/carts/${stale}/complete`, {}, auth(co.owner.token, wholesale)).catch((e) => e.response)
      expect(err).toMatchObject({ status: 400, data: { message: "Platform fee changed. Please review your cart." } })
      await api.post(`/store/carts/${stale}`, {}, auth(co.owner.token, wholesale)) // any cart update re-syncs
      expect(feeLine(await getCart(stale, co.owner.token, wholesale)).metadata.platform_fee).toMatchObject({ amount: 450, monthly_volume: 12000, base: 21000, percent: 5 })
      const ok = await pay(co.owner.token, wholesale, stale, NET)
      expect(ok.data.order.total).toBe(9000 + 10 / 2 + 450) // one vendor shipping (5)
      await childIds(ok.data.order.id)
    })

    it("commission: precedence, channel, plan, tester, snapshot", async () => {
      const product = getContainer().resolve(Modules.PRODUCT)
      const [cat] = await product.createProductCategories([{ name: "Rugs", handle: "rugs-p4", is_active: true }])
      const a = await vendor("Acme", [100, 100])
      const b = await vendor("Bolt", [100, 100])
      const s = await vendor("Solo", [100], null) // Starter
      await product.updateProducts(a.products[0].product_id, { category_ids: [cat.id] })
      await product.updateProducts(b.products[0].product_id, { category_ids: [cat.id] })
      const business = await planId("business")
      const rule = async (body: Row) => (await api.post("/admin/commission-rules", body, auth(admin))).data.commission_rule as Row
      await rule({ scope: "category", scope_id: cat.id, channel: "all", percent: 8 })
      const vendorRule = await rule({ scope: "vendor", scope_id: a.id, channel: "b2c", percent: 12 })
      await rule({ scope: "vendor", scope_id: a.id, channel: "all", percent: 30 }) // exact channel (b2c) beats all
      await rule({ scope: "vendor_category", scope_id: `${a.id}:${cat.id}`, channel: "all", percent: 5 })
      await rule({ scope: "plan", scope_id: business, channel: "all", percent: 9, fixed_amount: 0.5, max: 9.2 })
      await rule({ scope: "vendor", scope_id: b.id, channel: "b2b", percent: 3 })
      await rule({ scope: "vendor", scope_id: s.id, channel: "all", percent: 50, active_to: new Date(Date.now() - DAY) }) // expired
      await expect(rule({ scope: "vendor_category", scope_id: a.id, channel: "all", percent: 5 })).rejects.toMatchObject(status(400))
      await expect(rule({ scope: "global", scope_id: "x", channel: "all", percent: 5 })).rejects.toMatchObject(status(400))

      const test = async (vendor_id: string, category_id: string | null, channel: string, amount = 100) =>
        (await api.get(`/admin/commission-rules/resolve?vendor_id=${vendor_id}&channel=${channel}&amount=${amount}${category_id ? `&category_id=${category_id}` : ""}`, auth(admin))).data
      expect(await test(a.id, cat.id, "b2c")).toMatchObject({ commission: 5, rule: { scope: "vendor_category" } })
      expect(await test(a.id, null, "b2c")).toMatchObject({ commission: 12, rule: { scope: "vendor", channel: "b2c" } })
      expect(await test(a.id, null, "b2b")).toMatchObject({ commission: 30, rule: { scope: "vendor", channel: "all" } })
      expect(await test(b.id, cat.id, "b2c")).toMatchObject({ commission: 8, rule: { scope: "category" } })
      expect(await test(b.id, null, "b2c")).toMatchObject({ commission: 9.2, rule: { scope: "plan" } }) // 9.5 → max 9.2
      expect(await test(b.id, null, "b2c", 50)).toMatchObject({ commission: 5 }) // 4.5 + 0.5
      expect(await test(b.id, null, "b2b")).toMatchObject({ commission: 3, rule: { scope: "vendor" } })
      expect(await test(s.id, null, "b2c")).toMatchObject({ commission: 10, rule: { scope: "global" } })
      const listed = (await api.get("/admin/commission-rules", auth(admin))).data.commission_rules
      expect(listed[0].scope).toBe("vendor_category")
      expect(listed.find((r: Row) => r.scope === "plan").scope_label).toBe("Business")

      const buyer = await customer("cara")
      const { children } = await place(buyer.token, retail, [...a.variants, ...b.variants, ...s.variants].map((variant_id) => ({ variant_id, quantity: 1 })), BANK)
      const [oa, ob, os] = [await childOf(a, children), await childOf(b, children), await childOf(s, children)]
      const byTitle = (o: Row) => Object.fromEntries(o.items.map((i: Row) => [i.title, i.commission]))
      expect(byTitle(oa)).toEqual({ "Acme item 0": 5, "Acme item 1": 12 })
      expect(byTitle(ob)).toEqual({ "Bolt item 0": 8, "Bolt item 1": 9.2 })
      expect(byTitle(os)).toEqual({ "Solo item 0": 10 })
      expect([oa.commission_total, ob.commission_total, os.commission_total]).toEqual([17, 17.2, 10])
      const { data: [raw] } = await getContainer().resolve("query").graph({ entity: "order", fields: ["items.title", "items.metadata"], filters: { id: oa.id } })
      expect((raw.items as Row[]).find((i) => i.title === "Acme item 1")!.metadata.commission).toMatchObject({ rule_id: vendorRule.id, scope: "vendor", percent: 12, amount: 12 })

      // Later edits never change placed orders.
      await api.post(`/admin/commission-rules/${vendorRule.id}`, { percent: 40 }, auth(admin))
      expect((await test(a.id, null, "b2c")).commission).toBe(40)
      expect((await api.get(`/vendors/orders/${oa.id}`, auth(a.token))).data.order.commission_total).toBe(17)
    })

    it("ledger: COD + bank transfer (worked examples A, B), hold → available, refund, payout batch", async () => {
      process.env.PAYOUT_HOLD_DAYS = "7"
      const a = await vendor("Alpha", [10, 20])
      const b = await vendor("Beta", [7])
      const mona = await customer("mona")
      const lines = [...a.variants, ...b.variants].map((variant_id) => ({ variant_id, quantity: 2 }))

      // A. COD: vendors collect goods + their fee share in cash → they owe commission + fee.
      const cod = await place(mona.token, retail, lines, COD)
      expect(cod.order.total).toBe(85.48)
      const ob = await childOf(b, cod.children)
      let oa = await childOf(a, cod.children)
      expect([oa.total, oa.fee_share, oa.commission_total, ob.total, ob.fee_share, ob.commission_total]).toEqual([65, 1.2, 6, 19, 0.28, 1.4])
      await shipAndDeliver(a, oa.id)
      await shipAndDeliver(b, ob.id)
      expect(await captures(cod.order.id)).toEqual([66.2, 19.28])
      const la = await ledger(a.id)
      expect(la.map((e) => [e.type, e.amount, e.status, e.note]).sort()).toEqual(
        [["commission", -6, "pending", null], ["fee_collected", -1.2, "pending", null], ["payout", -65, "pending", "cod_cash"], ["sale", 65, "pending", null]].sort(),
      )
      expect(sumC(la)).toBe(-720)
      expect(sumC(await ledger(b.id))).toBe(-168)
      expect(Math.round((+new Date(la[0].available_at) - Date.now()) / DAY)).toBe(7)
      // Delivering twice can't double-post.
      await expect(api.post(`/vendors/orders/${oa.id}/deliver`, {}, auth(a.token))).rejects.toMatchObject(status(400))
      expect((await ledger(a.id)).length).toBe(4)

      // B. Bank transfer: platform collects everything (fee included).
      const bank = await place(mona.token, retail, lines, BANK)
      await api.post(`/admin/orders/${bank.order.id}/confirm-transfer`, {}, auth(admin))
      expect(await captures(bank.order.id)).toEqual([85.48])
      oa = await childOf(a, bank.children)
      await shipAndDeliver(a, oa.id)
      const saleB = (await ledger(a.id)).filter((e) => e.vendor_order_id === oa.id)
      expect(saleB.map((e) => [e.type, e.amount]).sort()).toEqual([["commission", -6], ["sale", 65]])

      // Hold: nothing moves now; 8 days later everything is available.
      expect(await releaseAvailable(getContainer())).toBe(0)
      let summary = (await api.get("/vendors/payouts", auth(a.token))).data.summary
      expect(summary).toEqual({ pending: 51.8, available: 0, balance: 51.8, owed: 0, paid_total: 0 })
      expect(await releaseAvailable(getContainer(), new Date(Date.now() + 8 * DAY))).toBe(10)
      summary = (await api.get("/vendors/payouts", auth(a.token))).data.summary
      expect(summary).toEqual({ pending: 0, available: 51.8, balance: 51.8, owed: 0, paid_total: 0 })
      expect((await api.get("/vendors/payouts", auth(b.token))).data.summary).toMatchObject({ balance: -1.68, owed: 1.68 })

      // E. Refund 20 on the bank order after delivery: refund −20, commission +2 (6 × 20/60). Fee untouched.
      await expect(api.post(`/admin/vendor-orders/${oa.id}/refund`, { amount: 65.01 }, auth(admin))).rejects.toMatchObject(status(400))
      const refund = (await api.post(`/admin/vendor-orders/${oa.id}/refund`, { amount: 20, note: "damaged" }, auth(admin))).data.entries
      expect(refund.map((e: Row) => [e.type, e.amount, e.status])).toEqual([["refund", -20, "available"], ["commission", 2, "available"]])
      expect((await api.get("/vendors/payouts", auth(a.token))).data.summary.available).toBe(33.8) // 59 − 18 − 7.20 (COD)
      await expect(api.post(`/admin/vendor-orders/${ob.id}/refund`, { amount: 1 }, auth(admin))).resolves.toBeTruthy()

      // Batch: every available entry (COD debts netted) → paid with reference → balance 0.
      await expect(api.post("/admin/payout-batches", { vendor_id: b.id }, auth(admin))).rejects.toMatchObject({ response: { status: 400, data: { message: "Nothing to pay out." } } })
      const batch = (await api.post("/admin/payout-batches", { vendor_id: a.id }, auth(admin))).data.batch
      expect(batch).toMatchObject({ amount: 33.8, status: "open", entry_count: 8, vendor: { id: a.id } })
      await expect(api.post("/admin/payout-batches", { vendor_id: a.id }, auth(admin))).rejects.toMatchObject(status(400))
      const paid = (await api.post(`/admin/payout-batches/${batch.id}/mark-paid`, { reference: "TRX-1" }, auth(admin))).data.batch
      expect(paid).toMatchObject({ status: "paid", reference: "TRX-1" })
      await expect(api.post(`/admin/payout-batches/${batch.id}/mark-paid`, { reference: "TRX-1" }, auth(admin))).rejects.toMatchObject(status(400))
      expect((await api.get("/vendors/payouts", auth(a.token))).data).toMatchObject({ summary: { balance: 0, available: 0, paid_total: 33.8 }, batches: [expect.objectContaining({ reference: "TRX-1" })] })
      const own = (await api.get("/vendors/payouts/ledger?type=payout", auth(a.token))).data
      expect(own.entries.map((e: Row) => [e.amount, e.status, e.note]).sort()).toEqual([[-33.8, "paid", "TRX-1"], [-65, "paid", "cod_cash"]].sort())
      await expect(api.get("/vendors/payouts/ledger?type=nope", auth(a.token))).rejects.toMatchObject(status(400))
      const balances = (await api.get("/admin/payouts/balances", auth(admin))).data.balances
      expect(balances.find((x: Row) => x.vendor.id === b.id)).toMatchObject({ balance: -2.58 }) // −1.68 − 1 + 0.10 (1.40 × 1/14)
    })

    it("net terms quote (worked example C): fee on offer + order, ledger waits for the invoice", async () => {
      const v = await vendor("Helwan", [11.1])
      const co = await company("kappa", 20000)
      const rfq = (await api.post("/store/quotes", { items: [{ variant_id: v.variants[0], quantity: 800.5 }] }, auth(co.owner.token))).data
      const qid = rfq.quotes[0].id
      expect((await api.get(`/store/quotes/${qid}`, auth(co.owner.token))).data.quote.fee).toBeNull() // no offer yet
      await api.post(`/vendors/quotes/${qid}/offer`, { items: [{ id: rfq.quotes[0].items[0].id, offered_unit_price: 11.1 }], validity_until: new Date(Date.now() + DAY) }, auth(v.token))
      const offered = (await api.get(`/store/quotes/${qid}`, auth(co.owner.token))).data.quote
      expect(offered).toMatchObject({ total: 8885.55, fee: { amount: 533.13, channel: "b2b", percent: 6, monthly_volume: 0 } })
      expect((await api.get(`/vendors/quotes/${qid}`, auth(v.token))).data.quote.fee).toBeUndefined()
      const q = (await api.post(`/store/quotes/${qid}/accept`, {}, auth(co.owner.token))).data.quote
      expect(q).toMatchObject({ status: "ordered", fee: { amount: 533.13 } })
      const { data: [o] } = await getContainer().resolve("query").graph({ entity: "order", fields: ["total", "items.metadata", "items.unit_price"], filters: { id: q.order_id } })
      expect(Number(o.total)).toBe(9418.68)
      const inv = await waitFor(async () => (await api.get(`/admin/invoices?company_id=${co.id}`, auth(admin))).data.invoices[0])
      expect(inv.amount).toBe(9418.68)
      const [child] = await childIds(q.order_id)
      const vo = (await api.get(`/vendors/orders/${child}`, auth(v.token))).data.order
      expect(vo).toMatchObject({ total: 8885.55, commission_total: 888.56, fee_share: 533.13 })
      await shipAndDeliver(v, child)
      const entries = await ledger(v.id)
      expect(entries.map((e) => [e.type, e.amount]).sort()).toEqual([["commission", -888.56], ["sale", 8885.55]])
      // Hold passed but the invoice is unpaid → still pending; paid → available 7996.99.
      expect(await releaseAvailable(getContainer(), new Date(Date.now() + 8 * DAY))).toBe(0)
      await api.post(`/admin/invoices/${inv.id}/mark-paid`, {}, auth(admin))
      expect(await releaseAvailable(getContainer(), new Date(Date.now() + 8 * DAY))).toBe(2)
      expect((await api.get("/vendors/payouts", auth(v.token))).data.summary).toMatchObject({ available: 7996.99, pending: 0 })
    })

    it("plans: product limit, B2B gating, upgrade request, past due → hidden → paid", async () => {
      const svc = planSvc(getContainer())
      const [starter] = await svc.listPlans({ handle: "starter" })
      await api.post(`/admin/plans/${starter.id}`, { product_limit: 2 }, auth(admin))
      const s = await vendor("Solo", [10, 12], null)
      await expect(vendor("Solo2", [1, 2, 3], null)).rejects.toMatchObject({ response: { status: 400, data: { message: "Plan limit reached: Starter allows 2 products. Upgrade your plan to add more." } } })
      const csv = new FormData()
      csv.append("file", new Blob(["title,price_usd\nX,1\n"], { type: "text/csv" }), "p.csv")
      const imported = (await api.post("/vendors/products/import", csv, auth(s.token))).data
      expect(imported).toMatchObject({ created: [], errors: [{ row: 2, errors: ["Plan limit reached: Starter allows 2 products. Upgrade your plan to add more."] }] })

      // Starter: no B2B.
      const tiers = { tiers: [{ min_qty: 10, unit_price_usd: 9 }] }
      await expect(api.put(`/vendors/products/${s.products[0].product_id}/wholesale-tiers`, tiers, auth(s.token))).rejects.toMatchObject(status(400))
      expect((await api.put(`/vendors/products/${s.products[0].product_id}/wholesale-tiers`, { tiers: [] }, auth(s.token))).data.tiers).toEqual([])
      const co = await company("omega")
      await expect(api.post("/store/quotes", { items: [{ variant_id: s.variants[0], quantity: 5 }] }, auth(co.owner.token))).rejects.toMatchObject({
        response: { status: 400, data: { message: "Solo does not accept quote requests." } },
      })

      // Plan page + upgrade request → admin feed.
      const page = (await api.get("/vendors/plan", auth(s.token))).data
      expect(page).toMatchObject({ plan: { handle: "starter", can_b2b: false }, usage: { products: 2, staff: 1 }, subscription: { status: "active", id: null } })
      expect(page.plans.map((p: Row) => p.handle)).toEqual(["starter", "business", "enterprise"])
      const business = page.plans.find((p: Row) => p.handle === "business")
      const req = (await api.post("/vendors/plan/upgrade-request", { plan_id: business.id }, auth(s.token))).data.subscription
      expect(req).toMatchObject({ requested_plan_id: business.id, plan: { handle: "starter" } })
      const feed = await getContainer().resolve(Modules.NOTIFICATION).listNotifications({ channel: "feed" })
      expect(feed.some((n) => (n.data as Row)?.title === "Plan upgrade request")).toBe(true)
      const sub = (await api.get("/admin/vendor-subscriptions", auth(admin))).data.subscriptions.find((x: Row) => x.vendor.id === s.id)
      expect(sub.requested_plan.handle).toBe("business")
      const upgraded = (await api.post(`/admin/vendor-subscriptions/${sub.id}/mark-paid`, { plan_id: business.id }, auth(admin))).data.subscription
      expect(upgraded).toMatchObject({ status: "active", plan: { handle: "business" }, requested_plan_id: null })
      expect(Math.round((+new Date(upgraded.current_period_end) - Date.now()) / DAY)).toBeGreaterThanOrEqual(28)
      expect((await api.put(`/vendors/products/${s.products[0].product_id}/wholesale-tiers`, tiers, auth(s.token))).data.tiers).toEqual(tiers.tiers)

      // Period ends → past_due + email; still visible during grace.
      await svc.updateVendorSubscriptions({ id: sub.id, current_period_end: new Date(Date.now() - DAY) })
      expect(await flagPastDue(getContainer())).toBe(1)
      expect(emails().filter((f) => f.includes("plan-past-due") && f.includes("solo@vendor.test")).length).toBe(2) // EN + AR
      expect((await api.get("/vendors/me", auth(s.token))).data.plan).toMatchObject({ status: "past_due", past_due: true, read_only: false })
      const pid = s.products[0].product_id
      expect((await api.get(`/store/products?id=${pid}`, auth())).data.count).toBe(1)

      // Beyond grace → hidden (list + detail + cart), product editing read-only; orders still work.
      await svc.updateVendorSubscriptions({ id: sub.id, current_period_end: new Date(Date.now() - 10 * DAY) })
      expect((await api.get("/vendors/me", auth(s.token))).data.plan.read_only).toBe(true)
      expect((await api.get(`/store/products?id=${pid}`, auth())).data.count).toBe(0)
      const all = (await api.get("/store/products?limit=100", auth())).data.products.map((p: Row) => p.id)
      expect(all).not.toContain(pid)
      await expect(api.get(`/store/products/${pid}`, auth())).rejects.toMatchObject(status(404))
      const buyer = await customer("zed")
      await expect(cart(buyer.token, retail, [{ variant_id: s.variants[0], quantity: 1 }])).rejects.toMatchObject({ response: { status: 400, data: { message: "This product is currently unavailable." } } })
      await expect(api.post(`/vendors/products/${pid}`, { title: "New" }, auth(s.token))).rejects.toMatchObject(status(400))
      await expect(api.put(`/vendors/products/${pid}/wholesale-tiers`, { tiers: [] }, auth(s.token))).rejects.toMatchObject(status(400))
      expect((await api.get("/vendors/products", auth(s.token))).data.count).toBe(2)
      expect((await api.get("/vendors/orders", auth(s.token))).status).toBe(200)

      // Paid → visible again.
      await api.post(`/admin/vendor-subscriptions/${sub.id}/mark-paid`, {}, auth(admin))
      expect((await api.get(`/store/products/${pid}`, auth())).data.product.id).toBe(pid)
      expect((await api.get("/vendors/me", auth(s.token))).data.plan).toMatchObject({ status: "active", read_only: false })
    })

    it("exact-cents matrix: B2C/B2B × payment × rule level × refund", async () => {
      process.env.PAYOUT_HOLD_DAYS = "0"
      const product = getContainer().resolve(Modules.PRODUCT)
      const [cat] = await product.createProductCategories([{ name: "Pots", handle: "pots-p4", is_active: true }])
      const vg = await vendor("Glob", [19.99]) // global 10%
      const vc = await vendor("Catt", [7.77]) // category 12.5%
      const vv = await vendor("Vend", [33.33]) // vendor 7.5% + 0.3 per line
      await product.updateProducts(vc.products[0].product_id, { category_ids: [cat.id] })
      await api.post("/admin/commission-rules", { scope: "category", scope_id: cat.id, channel: "all", percent: 12.5 }, auth(admin))
      await api.post("/admin/commission-rules", { scope: "vendor", scope_id: vv.id, channel: "all", percent: 7.5, fixed_amount: 0.3 }, auth(admin))
      const RATE: Record<string, [number, number]> = { [vg.id]: [10, 0], [vc.id]: [12.5, 0], [vv.id]: [7.5, 30] }
      const vendors = [vg, vc, vv]
      const qty = [3, 7, 1]
      const lines = vendors.map((v, i) => ({ variant_id: v.variants[0], quantity: qty[i] }))
      const subtotal = c(19.99) * 3 + c(7.77) * 7 + c(33.33) // 59.97 + 54.39 + 33.33 = 147.69
      const co = await company("matrix", 100000)
      const b2c = await customer("matrix-b2c")

      const cases = [
        { name: "b2c cod", token: b2c.token, key: retail, provider: COD, fee: pct(subtotal, 2) },
        { name: "b2c bank", token: b2c.token, key: retail, provider: BANK, fee: pct(subtotal, 2) },
        { name: "b2b bank", token: co.owner.token, key: wholesale, provider: BANK, fee: 25000 }, // 6% = 8.86 → min 250
        { name: "b2b net", token: co.buyer.token, key: wholesale, provider: NET, fee: 25000 },
      ]
      for (const k of cases) {
        const { order, children } = await place(k.token, k.key, lines, k.provider)
        const shipping = 3 * 500
        expect([k.name, c(order.total)]).toEqual([k.name, subtotal + shipping + k.fee])
        if (k.provider === BANK) await api.post(`/admin/orders/${order.id}/confirm-transfer`, {}, auth(admin))
        // Fee shares: largest remainder over vendor subtotals, sum exact.
        const subs = vendors.map((v, i) => c([19.99, 7.77, 33.33][i]) * qty[i])
        const raw = subs.map((s) => (k.fee * s) / subtotal)
        const shares = raw.map(Math.floor)
        const order_ = raw.map((r, i) => [r - Math.floor(r), i]).sort((x, y) => y[0] - x[0] || x[1] - y[1])
        const left = k.fee - shares.reduce((s, x) => s + x, 0)
        for (let j = 0; j < left; j++) shares[order_[j][1]]++
        let captured = 0
        for (const [i, v] of vendors.entries()) {
          const vo = await childOf(v, children)
          const [p, fixed] = RATE[v.id]
          const comm = pct(subs[i], p) + fixed
          expect([k.name, v.id, c(vo.total), c(vo.commission_total), c(vo.fee_share)]).toEqual([k.name, v.id, subs[i] + 500, comm, shares[i]])
          await shipAndDeliver(v, vo.id)
          captured += subs[i] + 500 + shares[i]
          const mine = (await ledger(v.id)).filter((e) => e.vendor_order_id === vo.id)
          const expected = k.provider === COD ? -comm - shares[i] : subs[i] + 500 - comm
          expect([k.name, v.id, sumC(mine)]).toEqual([k.name, v.id, expected])
        }
        expect(shares.reduce((s, x) => s + x, 0)).toBe(k.fee)
        if (k.provider === COD) expect(c((await captures(order.id)).reduce((s, x) => s + x, 0))).toBe(captured)
        if (k.provider === NET) {
          const inv = await waitFor(async () => (await api.get(`/admin/invoices?company_id=${co.id}`, auth(admin))).data.invoices.find((x: Row) => x.order_id === order.id))
          expect(c(inv.amount)).toBe(c(order.total))
          await api.post(`/admin/invoices/${inv.id}/mark-paid`, {}, auth(admin))
        }
        // Refund one unit of Glob (19.99): commission back = round(comm × 1999 / 5997).
        const vo = await childOf(vg, children)
        const back = Math.round((c(vo.commission_total) * 1999) / 5997)
        const r = (await api.post(`/admin/vendor-orders/${vo.id}/refund`, { amount: 19.99 }, auth(admin))).data.entries
        expect([k.name, r.map((e: Row) => c(e.amount))]).toEqual([k.name, [-1999, back]])
      }
      // Hold 0 → all released (net terms paid above); grand totals per vendor are the sum of the parts.
      await releaseAvailable(getContainer(), new Date(Date.now() + 1000))
      for (const v of vendors) {
        const entries = await ledger(v.id)
        expect(entries.every((e) => e.status === "available")).toBe(true)
        expect(c((await api.get("/vendors/payouts", auth(v.token))).data.summary.balance)).toBe(sumC(entries))
      }
    })
  },
})
