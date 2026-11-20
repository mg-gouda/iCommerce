import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import seedDefaults from "../../src/scripts/seed-defaults"
import importWp from "../../src/scripts/import-wp"
import rebuildReports from "../../src/scripts/rebuild-reports"
import { rebuildOrderFacts } from "../../src/lib/reports"
import { VENDOR_MODULE } from "../../src/modules/vendor"

jest.setTimeout(600 * 1000)

const EMAILS = mkdtempSync(join(tmpdir(), "icommerce-p5-emails-"))
process.env.EMAILS_DIR = EMAILS

const PASSWORD = "Passw0rd!"
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const status = (n: number) => ({ response: { status: n } })
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const COD = "pp_cod_cod"
const BANK = "pp_bank-transfer_bank-transfer"
const MONTH = "from=2026-10-01&to=2026-10-31"
/** CSV body → rows of cells (no quoted commas in this data). */
const csv = (s: string) => s.replace(/^﻿/, "").trim().split("\r\n").map((l) => l.split(","))
const sumCol = (rows: string[][], col: string) => Math.round(rows.slice(1).reduce((s, r) => s + Number(r[rows[0].indexOf(col)]) * 100, 0)) / 100

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let admin: string
    let retail: string
    let wholesale: string
    const auth = (token?: string, key = retail) => ({ headers: { "x-publishable-api-key": key, ...(token && { authorization: `Bearer ${token}` }) } })
    const knex = () => getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION)

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

    async function vendor(name: string, prices: number[]) {
      const email = `${name.toLowerCase()}@vendor.test`
      const reg = await api.post("/auth/vendor/emailpass/register", { email, password: PASSWORD })
      const { data } = await api.post("/vendors", { name, country: "EG" }, auth(reg.data.token))
      await api.post(`/admin/vendors/${data.vendor.id}/approve`, {}, auth(admin))
      const plan = (await api.get("/admin/plans", auth(admin))).data.plans.find((p: Row) => p.handle === "business").id
      await api.post("/admin/vendor-subscriptions", { vendor_id: data.vendor.id, plan_id: plan }, auth(admin))
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

    async function customer(name: string) {
      const email = `${name}@buyer.test`
      const reg = await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })
      const r = await api.post("/store/customers", { email, first_name: name, last_name: "Buyer" }, auth(reg.data.token))
      return { email, id: r.data.customer.id as string, token: (await api.post("/auth/customer/emailpass", { email, password: PASSWORD })).data.token as string }
    }

    /** Verified company: admin + one buyer. */
    async function company(name: string) {
      const owner = await customer(`${name}-admin`)
      const created = await api.post("/store/companies", { name: `${name} Imports`, country: "eg", city: "Cairo", address: "1 Nile St", phone: "+20100" }, auth(owner.token))
      const buyer = await customer(`${name}-buyer`)
      await api.post("/store/companies/me/invitations", { email: buyer.email, role: "buyer" }, auth(owner.token))
      const file = readdirSync(EMAILS).find((f) => f.includes("company-invite") && f.includes(buyer.email))!
      await api.post("/store/companies/invitations/accept", { token: readFileSync(join(EMAILS, file), "utf8").match(/token=([\w-]+)/)![1] }, auth(buyer.token))
      const f = new FormData()
      f.append("tax_id", "TAX-1")
      f.append("commercial_reg_no", "CR-1")
      f.append("files", new Blob(["%PDF-1.4 cr"], { type: "application/pdf" }), "cr.pdf")
      await api.post("/store/companies/me/kyc", f, auth(owner.token))
      const id = created.data.company.id as string
      await api.post(`/admin/companies/${id}/verify`, {}, auth(admin))
      return { id, owner, buyer }
    }

    async function waitFor<T>(fn: () => Promise<T | undefined | null | false>) {
      for (let i = 0; i < 75; i++) {
        const v = await fn()
        if (v) return v
        await sleep(200)
      }
      throw new Error("timeout")
    }

    /** Checkout → parent order + child ids, once report facts exist. */
    async function place(token: string, key: string, lines: { variant_id: string; quantity: number }[], provider_id: string) {
      const region = (await api.get("/store/regions", auth(undefined, key))).data.regions.find((r: Row) => r.name === "Egypt")
      const id = (await api.post("/store/carts", { region_id: region.id }, auth(token, key))).data.cart.id
      for (const l of lines) await api.post(`/store/carts/${id}/line-items`, l, auth(token, key))
      await api.post(`/store/carts/${id}`, { shipping_address: { first_name: "Mona", last_name: "A.", address_1: "1 Nile St", city: "Giza", country_code: "eg", phone: "+20100" } }, auth(token, key))
      for (const g of (await api.get(`/store/carts/${id}/vendor-groups`, auth(token, key))).data.vendor_groups)
        await api.post(`/store/carts/${id}/shipping-methods`, { option_id: g.shipping_options[0].id }, auth(token, key))
      const pc = (await api.post("/store/payment-collections", { cart_id: id }, auth(token, key))).data.payment_collection
      await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id }, auth(token, key))
      const res = await api.post(`/store/carts/${id}/complete`, {}, auth(token, key))
      expect(res.data.type).toBe("order")
      const order = res.data.order as Row
      await waitFor(async () => (await knex()("report_line").where({ parent_order_id: order.id }).count("* as n"))[0].n > 0)
      const { metadata } = await getContainer().resolve(Modules.ORDER).retrieveOrder(order.id, { select: ["metadata"] })
      return { order, children: metadata!.vendor_order_ids as string[], attribution: metadata!.sales_attribution as Row | undefined }
    }
    const childOf = async (v: { token: string }, children: string[]) => {
      for (const id of children) {
        const r = await api.get(`/vendors/orders/${id}`, auth(v.token)).catch(() => null)
        if (r) return r.data.order as Row
      }
      throw new Error("no vendor order")
    }
    /** Comparable fact rows (ids and timestamps dropped). */
    const facts = async () =>
      (await knex()("report_line").select("*").orderBy(["order_id", "gross"])).map(({ id, created_at, updated_at, ...r }: Row) => r) // eslint-disable-line @typescript-eslint/no-unused-vars

    it("sales org: tree derived at write time, 404 on unknown ids, 409 when referenced", async () => {
      const post = async (path: string, body: Row) => (await api.post(`/admin/sales-org/${path}`, body, auth(admin))).data
      const br = (await post("branches", { code: "CAI", name: "Cairo" })).branch
      await expect(post("branches", { code: "CAI", name: "Dup" })).rejects.toMatchObject(status(409))
      const bm = (await post("reps", { type: "branch_manager", code: "M1", name: "Manager", branch_id: br.id })).rep
      const am = (await post("reps", { type: "account_manager", code: "A1", name: "Account", manager_id: bm.id })).rep
      expect(am).toMatchObject({ branch_id: br.id, manager_id: bm.id, active: true })
      await expect(post("reps", { type: "broker", code: "K1", name: "Broker", manager_id: am.id })).rejects.toMatchObject(status(404)) // manager must be a branch manager
      const loose = (await post("reps", { type: "broker", code: "K9", name: "Loose" })).rep
      expect((await api.get("/admin/sales-org/reps?type=account_manager", auth(admin))).data).toMatchObject({ count: 1, reps: [{ id: am.id }] })
      expect((await api.get("/admin/sales-org/reps?q=Loo", auth(admin))).data.reps.map((r: Row) => r.id)).toEqual([loose.id])

      const buyer = await customer("tree")
      const put = (body: Row) => api.put("/admin/sales-org/assignments", body, auth(admin))
      const a = (await put({ target_type: "customer", target_id: buyer.id, account_manager_id: am.id })).data.assignment
      expect(a).toMatchObject({ branch_id: br.id, branch_manager_id: bm.id, account_manager_id: am.id, broker_id: null })
      const again = (await put({ target_type: "customer", target_id: buyer.id, broker_id: loose.id })).data.assignment // upsert, same row
      expect(again).toMatchObject({ id: a.id, branch_id: null, branch_manager_id: null, account_manager_id: null, broker_id: loose.id })
      await put({ target_type: "customer", target_id: buyer.id, account_manager_id: am.id })
      await expect(put({ target_type: "customer", target_id: buyer.id, broker_id: "srep_nope" })).rejects.toMatchObject(status(404))
      await expect(put({ target_type: "company", target_id: "comp_nope", branch_id: br.id })).rejects.toMatchObject(status(404))
      expect((await api.get(`/admin/sales-org/assignments?target_type=customer&target_id=${buyer.id}`, auth(admin))).data.count).toBe(1)

      await expect(api.delete(`/admin/sales-org/branches/${br.id}`, auth(admin))).rejects.toMatchObject(status(409))
      await expect(api.delete(`/admin/sales-org/reps/${bm.id}`, auth(admin))).rejects.toMatchObject(status(409))
      await expect(api.delete(`/admin/sales-org/reps/${am.id}`, auth(admin))).rejects.toMatchObject(status(409))
      expect((await api.post(`/admin/sales-org/reps/${am.id}`, { active: false }, auth(admin))).data.rep.active).toBe(false)
      expect((await api.delete(`/admin/sales-org/reps/${loose.id}`, auth(admin))).data.deleted).toBe(true)
      await api.delete(`/admin/sales-org/assignments/${a.id}`, auth(admin))
      await api.delete(`/admin/sales-org/reps/${am.id}`, auth(admin))
      await api.delete(`/admin/sales-org/reps/${bm.id}`, auth(admin))
      expect((await api.delete(`/admin/sales-org/branches/${br.id}`, auth(admin))).data.deleted).toBe(true)
    })

    it("reports: seeded month to the cent, isolation, CSV, attribution, rebuild + cancel", async () => {
      // Sales org: customer → AM1 (BM1, BR1); company → broker K1 (BM2, BR2).
      const post = async (path: string, body: Row) => (await api.post(`/admin/sales-org/${path}`, body, auth(admin))).data
      const br1 = (await post("branches", { code: "BR1", name: "Branch One" })).branch
      const br2 = (await post("branches", { code: "BR2", name: "Branch Two" })).branch
      const bm1 = (await post("reps", { type: "branch_manager", code: "BM1", name: "Manager One", branch_id: br1.id })).rep
      const bm2 = (await post("reps", { type: "branch_manager", code: "BM2", name: "Manager Two", branch_id: br2.id })).rep
      const am1 = (await post("reps", { type: "account_manager", code: "AM1", name: "Account One", manager_id: bm1.id })).rep
      const k1 = (await post("reps", { type: "broker", code: "K1", name: "Broker One", manager_id: bm2.id })).rep
      const assign = (target_type: string, target_id: string, body: Row) => api.put("/admin/sales-org/assignments", { target_type, target_id, ...body }, auth(admin))

      const A = await vendor("Alpha", [100, 12.5])
      const B = await vendor("Beta", [40])
      const mona = await customer("mona")
      const co = await company("delta")
      await assign("customer", mona.id, { account_manager_id: am1.id })
      await assign("company", co.id, { broker_id: k1.id })
      await assign("customer", co.buyer.id, { account_manager_id: am1.id }) // company beats customer

      // O1 B2C COD (stays unpaid): A 2×100, B 1×40. Fee 2% of 240 = 4.80 → A 4.00, B 0.80.
      const o1 = await place(mona.token, retail, [{ variant_id: A.variants[0], quantity: 2 }, { variant_id: B.variants[0], quantity: 1 }], COD)
      expect(o1.attribution).toEqual({ branch_id: br1.id, branch_manager_id: bm1.id, account_manager_id: am1.id, broker_id: null, source: "customer" })
      // O2 B2C bank, confirmed (paid): A 3×12.5 + 1×100 = 137.50. Fee 2.75 → lines 0.75 / 2.00.
      const o2 = await place(mona.token, retail, [{ variant_id: A.variants[1], quantity: 3 }, { variant_id: A.variants[0], quantity: 1 }], BANK)
      await api.post(`/admin/orders/${o2.order.id}/confirm-transfer`, {}, auth(admin))
      // O3 B2B bank (unpaid) by the company buyer: A 1×100, B 3×40. Fee min 250 → A 113.64, B 136.36.
      const o3 = await place(co.buyer.token, wholesale, [{ variant_id: A.variants[0], quantity: 1 }, { variant_id: B.variants[0], quantity: 3 }], BANK)
      expect(o3.attribution).toEqual({ branch_id: br2.id, branch_manager_id: bm2.id, account_manager_id: null, broker_id: k1.id, source: "company" })
      // O4 B2C COD, canceled by the vendor → no rows.
      const o4 = await place(mona.token, retail, [{ variant_id: A.variants[1], quantity: 2 }], COD)
      expect((await knex()("report_line").where({ order_id: o4.children[0] })).length).toBe(1)
      await api.post(`/vendors/orders/${o4.children[0]}/cancel`, { reason: "Out of stock" }, auth(A.token))
      expect((await knex()("report_line").where({ parent_order_id: o4.order.id })).length).toBe(0)

      // O5 B2B, decimal quantity (quote-style line, 2.5 × 40), paid, guest-like buyer, no attribution: built directly.
      const orders = getContainer().resolve(Modules.ORDER)
      const ch = (await getContainer().resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "Wholesale" }))[0].id
      const line = { title: "Beta item 0", quantity: 2.5, unit_price: 40, product_id: B.products[0].product_id, variant_id: B.variants[0] }
      const [p5] = await orders.createOrders([{ currency_code: "usd", email: "rfq@buyer.test", sales_channel_id: ch, items: [line] }])
      const [c5] = await orders.createOrders([{
        currency_code: "usd", email: "rfq@buyer.test", sales_channel_id: ch, shipping_address: { country_code: "sa" },
        items: [{ ...line, metadata: { commission: { amount: 10 } } }],
        metadata: { parent_order_id: p5.id, vendor_id: B.id, fee_share: 250, commission_total: 10, paid_at: new Date().toISOString() },
      }])
      await orders.updateOrders(p5.id, { metadata: { vendor_order_ids: [c5.id] } })
      await getContainer().resolve(ContainerRegistrationKeys.LINK).create({ [VENDOR_MODULE]: { vendor_id: B.id }, [Modules.ORDER]: { order_id: c5.id }, data: { status: "pending" } })
      expect(await rebuildOrderFacts(getContainer(), c5.id)).toBe(1)

      // Spread over October (parents' created_at) → full rebuild.
      const days: [Row, string][] = [[o1.order, "2026-10-05"], [o2.order, "2026-10-12"], [o3.order, "2026-10-20"], [o4.order, "2026-10-15"], [p5, "2026-10-31"]]
      for (const [o, d] of days) await knex()("order").where({ id: o.id }).update({ created_at: `${d}T10:00:00Z` })
      await rebuildReports({ container: getContainer(), args: [] } as never)
      const first = await facts()
      expect(first).toHaveLength(7)
      await rebuildReports({ container: getContainer(), args: [] } as never)
      expect(await facts()).toEqual(first) // idempotent
      const row = (order_id: string, gross: number) => first.find((r) => r.order_id === order_id && Number(r.gross) === gross)!
      const a1 = await childOf(A, o1.children)
      expect(row(a1.id, 200)).toMatchObject({ day: "2026-10-05", channel: "b2c", paid: false, branch_id: br1.id, buyer_label: "mona Buyer", country_code: "eg", customer_id: mona.id, company_id: null })
      expect(Number(row(a1.id, 200).fee_share)).toBe(4)
      const a3 = await childOf(A, o3.children)
      expect(row(a3.id, 100)).toMatchObject({ channel: "b2b", buyer_label: "delta Imports", company_id: co.id, broker_id: k1.id, branch_id: br2.id })
      expect(Number(row(a3.id, 100).fee_share)).toBe(113.64)
      expect(row(c5.id, 100)).toMatchObject({ day: "2026-10-31", paid: true, buyer_label: "rfq@buyer.test", country_code: "sa", branch_id: null })
      expect(Number(row(c5.id, 100).quantity)).toBe(2.5)

      // Vendor A summary (hand-computed). revenue 200+137.5+100; fees 4+0.75+2+113.64.
      const sumA = (await api.get(`/vendors/reports/summary?${MONTH}`, auth(A.token))).data
      expect(sumA.range).toEqual({ from: "2026-10-01", to: "2026-10-31" })
      expect(sumA.kpis).toEqual({ revenue: 437.5, orders: 3, aov: 145.83, units: 7, commission: 43.75, fee_share: 120.39, net: 273.36, open_quotes: 0, unread_chats: null })
      expect(sumA.previous).toEqual({ revenue: 0, orders: 0, aov: 0, units: 0 })
      expect(sumA.series).toHaveLength(31)
      expect(sumA.series.filter((s: Row) => s.revenue)).toEqual([
        { period: "2026-10-05", revenue: 200, orders: 1 }, { period: "2026-10-12", revenue: 137.5, orders: 1 }, { period: "2026-10-20", revenue: 100, orders: 1 },
      ])
      expect((await api.get(`/vendors/reports/summary?${MONTH}&interval=week`, auth(A.token))).data.series).toEqual([
        { period: "2026-09-28", revenue: 0, orders: 0 }, { period: "2026-10-05", revenue: 200, orders: 1 }, { period: "2026-10-12", revenue: 137.5, orders: 1 },
        { period: "2026-10-19", revenue: 100, orders: 1 }, { period: "2026-10-26", revenue: 0, orders: 0 },
      ])
      expect((await api.get(`/vendors/reports/summary?from=2026-08-01&to=2026-10-31`, auth(A.token))).data.series).toEqual([
        { period: "2026-08-01", revenue: 0, orders: 0 }, { period: "2026-09-01", revenue: 0, orders: 0 }, { period: "2026-10-01", revenue: 437.5, orders: 3 },
      ])
      expect((await api.get(`/vendors/reports/summary?${MONTH}&paid=true`, auth(A.token))).data.kpis).toMatchObject({ revenue: 137.5, orders: 1, units: 4 })
      expect((await api.get(`/vendors/reports/summary?${MONTH}&channel=b2b`, auth(A.token))).data.kpis).toMatchObject({ revenue: 100, orders: 1, fee_share: 113.64 })
      expect((await api.get(`/vendors/reports/summary?from=2026-11-01&to=2026-11-30`, auth(A.token))).data.previous).toEqual({ revenue: 437.5, orders: 3, aov: 145.83, units: 7 })
      await expect(api.get(`/vendors/reports/summary?from=2026-10-31&to=2026-10-01`, auth(A.token))).rejects.toMatchObject(status(400))
      await expect(api.get(`/vendors/reports/summary?from=2026-02-30`, auth(A.token))).rejects.toMatchObject(status(400))

      // Vendor B: 40+120+100; units 1+3+2.5; net negative (B2B min fee).
      const sumB = (await api.get(`/vendors/reports/summary?${MONTH}`, auth(B.token))).data
      expect(sumB.kpis).toEqual({ revenue: 260, orders: 3, aov: 86.67, units: 6.5, commission: 26, fee_share: 387.16, net: -153.16, open_quotes: 0, unread_chats: null })

      // Breakdowns (vendor A): every `by`.
      const bd = async (v: { token: string }, by: string, extra = "") => (await api.get(`/vendors/reports/breakdown?${MONTH}&by=${by}${extra}`, auth(v.token))).data
      const prod = await bd(A, "product")
      expect(prod).toMatchObject({ by: "product", count: 2, total: { revenue: 437.5, orders: 3, units: 7 } })
      expect(prod.rows).toEqual([
        { key: A.products[0].product_id, label: "Alpha item 0", revenue: 400, orders: 3, units: 4, share: 0.9143 },
        { key: A.products[1].product_id, label: "Alpha item 1", revenue: 37.5, orders: 1, units: 3, share: 0.0857 },
      ])
      expect((await bd(A, "product", "&limit=1&offset=1")).rows.map((r: Row) => r.label)).toEqual(["Alpha item 1"])
      expect((await bd(A, "category")).rows).toEqual([{ key: null, label: "Unassigned", revenue: 437.5, orders: 3, units: 7, share: 1 }])
      expect((await bd(A, "country")).rows).toEqual([{ key: "eg", label: "EG", revenue: 437.5, orders: 3, units: 7, share: 1 }])
      expect((await bd(A, "channel")).rows).toEqual([
        { key: "b2c", label: "b2c", revenue: 337.5, orders: 2, units: 6, share: 0.7714 },
        { key: "b2b", label: "b2b", revenue: 100, orders: 1, units: 1, share: 0.2286 },
      ])
      expect((await bd(A, "buyer")).rows).toEqual([
        { key: mona.id, label: "mona Buyer", revenue: 337.5, orders: 2, units: 6, share: 0.7714 },
        { key: co.id, label: "delta Imports", revenue: 100, orders: 1, units: 1, share: 0.2286 },
      ])
      expect((await bd(B, "country")).rows.map((r: Row) => [r.key, r.revenue])).toEqual([["eg", 160], ["sa", 100]])
      await expect(api.get(`/vendors/reports/breakdown?by=vendor`, auth(A.token))).rejects.toMatchObject(status(400))

      // CSV: BOM, header, totals = JSON totals; isolation (A never sees B's rows).
      // arraybuffer: axios strips a leading BOM from text bodies.
      const raw = await api.get(`/vendors/reports/breakdown?${MONTH}&by=product&format=csv&limit=1`, { ...auth(A.token), responseType: "arraybuffer" })
      expect(raw.headers["content-type"]).toMatch(/^text\/csv/)
      expect(raw.headers["content-disposition"]).toBe('attachment; filename="icommerce-product-2026-10-01-2026-10-31.csv"')
      const body = Buffer.from(raw.data)
      expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      expect(body.subarray(3).toString("utf8").startsWith("key,label,revenue,orders,units,share\r\n")).toBe(true)
      const prodCsv = csv(body.toString("utf8"))
      raw.data = body.toString("utf8")
      expect(prodCsv).toHaveLength(3) // pagination ignored
      expect(sumCol(prodCsv, "revenue")).toBe(437.5)
      expect(raw.data).not.toContain("Beta")
      const sumCsv = csv((await api.get(`/vendors/reports/summary?${MONTH}&format=csv`, auth(A.token))).data)
      expect(sumCsv[0]).toEqual(["period", "revenue", "orders"])
      expect([sumCsv.length - 1, sumCol(sumCsv, "revenue")]).toEqual([31, 437.5])
      expect(sumCol(csv((await api.get(`/vendors/reports/breakdown?${MONTH}&by=buyer&format=csv`, auth(B.token))).data), "revenue")).toBe(260)
      for (const by of ["product", "buyer", "country"]) {
        const seen = JSON.stringify(await bd(B, by))
        for (const leak of ["Alpha", ...A.products.map((p) => p.product_id)]) expect(seen).not.toContain(leak)
        expect(JSON.parse(seen).total.revenue).toBe(260)
      }

      // Admin summary + every breakdown.
      const adm = (await api.get(`/admin/reports/summary?${MONTH}`, auth(admin))).data
      expect(adm.kpis).toEqual({ gmv: 697.5, orders: 6, aov: 116.25, units: 13.5, commission: 69.75, fees: 507.55, active_vendors: 2, new_vendors: 0, new_companies: 0 })
      expect(adm.previous).toEqual({ gmv: 0, orders: 0, aov: 0, units: 0 })
      expect(adm.kpis).not.toHaveProperty("open_quotes")
      const today = new Date().toISOString().slice(0, 10)
      expect((await api.get(`/admin/reports/summary?from=${today}&to=${today}`, auth(admin))).data.kpis).toMatchObject({ gmv: 0, new_vendors: 2, new_companies: 1 })
      const abd = async (by: string) => (await api.get(`/admin/reports/breakdown?${MONTH}&by=${by}`, auth(admin))).data
      const total = { revenue: 697.5, orders: 6, units: 13.5, commission: 69.75, fees: 507.55 }
      const vendorRows = await abd("vendor")
      expect(vendorRows).toMatchObject({ count: 2, total })
      expect(vendorRows.rows).toEqual([
        { key: A.id, label: "Alpha", revenue: 437.5, orders: 3, units: 7, share: 0.6272, commission: 43.75, fees: 120.39 },
        { key: B.id, label: "Beta", revenue: 260, orders: 3, units: 6.5, share: 0.3728, commission: 26, fees: 387.16 },
      ])
      const pick = (rows: Row[]) => rows.map((r) => [r.key, r.label, r.revenue, r.orders, r.commission, r.fees])
      expect(pick((await abd("branch")).rows)).toEqual([[br1.id, "Branch One", 377.5, 3, 37.75, 7.55], [br2.id, "Branch Two", 220, 2, 22, 250], [null, "Unassigned", 100, 1, 10, 250]])
      expect(pick((await abd("branch_manager")).rows)).toEqual([[bm1.id, "Manager One", 377.5, 3, 37.75, 7.55], [bm2.id, "Manager Two", 220, 2, 22, 250], [null, "Unassigned", 100, 1, 10, 250]])
      expect(pick((await abd("account_manager")).rows)).toEqual([[am1.id, "Account One", 377.5, 3, 37.75, 7.55], [null, "Unassigned", 320, 3, 32, 500]])
      expect(pick((await abd("broker")).rows)).toEqual([[null, "Unassigned", 477.5, 4, 47.75, 257.55], [k1.id, "Broker One", 220, 2, 22, 250]])
      expect(pick((await abd("channel")).rows)).toEqual([["b2c", "b2c", 377.5, 3, 37.75, 7.55], ["b2b", "b2b", 320, 3, 32, 500]])
      expect(pick((await abd("category")).rows)).toEqual([[null, "Unassigned", 697.5, 6, 69.75, 507.55]])
      expect(pick((await abd("country")).rows)).toEqual([["eg", "EG", 597.5, 5, 59.75, 257.55], ["sa", "SA", 100, 1, 10, 250]])
      expect(pick((await abd("buyer")).rows)).toEqual([
        [mona.id, "mona Buyer", 377.5, 3, 37.75, 7.55], [co.id, "delta Imports", 220, 2, 22, 250], ["rfq@buyer.test", "rfq@buyer.test", 100, 1, 10, 250],
      ])
      const admCsv = csv((await api.get(`/admin/reports/breakdown?${MONTH}&by=branch&format=csv`, auth(admin))).data)
      expect(admCsv[0]).toEqual(["key", "label", "revenue", "orders", "units", "share", "commission", "fees"])
      expect([sumCol(admCsv, "revenue"), sumCol(admCsv, "commission"), sumCol(admCsv, "fees")]).toEqual([697.5, 69.75, 507.55])

      // Admin routes: 401 for vendor + customer actors.
      for (const token of [A.token, mona.token]) {
        await expect(api.get(`/admin/reports/summary`, auth(token))).rejects.toMatchObject(status(401))
        await expect(api.get(`/admin/reports/breakdown`, auth(token))).rejects.toMatchObject(status(401))
        await expect(api.get(`/admin/sales-org/branches`, auth(token))).rejects.toMatchObject(status(401))
      }
      await expect(api.get(`/vendors/reports/summary`, auth(mona.token))).rejects.toMatchObject(status(401))

      // Reassignment never rewrites old orders (even after a full rebuild).
      await assign("customer", mona.id, { broker_id: k1.id })
      await rebuildReports({ container: getContainer(), args: [] } as never)
      expect(pick((await abd("branch")).rows)[0]).toEqual([br1.id, "Branch One", 377.5, 3, 37.75, 7.55])

      // Canceling a placed order (admin, parent) removes its rows.
      await getContainer().resolve(Modules.ORDER).cancel(o2.order.id)
      await rebuildOrderFacts(getContainer(), o2.order.id)
      expect((await api.get(`/vendors/reports/summary?${MONTH}`, auth(A.token))).data.kpis).toMatchObject({ revenue: 300, orders: 2 })
    })

    it("imports sales_org.json from the WP fixture", async () => {
      const dir = mkdtempSync(join(tmpdir(), "wp-out-"))
      cpSync(join(__dirname, "../fixtures/wp-out"), dir, { recursive: true })
      const customers = getContainer().resolve(Modules.CUSTOMER)
      const [plain] = await customers.createCustomers([{ email: "wp201@buyer.test", metadata: { legacy_id: "201" } }])
      const co = await company("wp")
      await customers.updateCustomers(co.owner.id, { metadata: { legacy_id: "202" } })
      const first = (await importWp({ container: getContainer(), args: [dir] })).sales_org
      expect(first).toEqual({
        "branches created": 2, "branches skipped: duplicate code": 1,
        "reps created": 4, "reps: unknown manager_code": 1,
        "assignments vendor created": 1, "assignments customer created": 1, "assignments company created": 1,
        "assignments: unknown broker code": 1, "assignments skipped: customer not imported": 1,
      })
      const list = async (path: string) => (await api.get(`/admin/sales-org/${path}`, auth(admin))).data
      const { branches } = await list("branches")
      const { reps } = await list("reps")
      const id = (code: string) => (reps as Row[]).find((r) => r.code === code)!.id
      const b1 = (branches as Row[]).find((b) => b.code === "FX-B1")!
      expect(b1).toMatchObject({ name: "Fixture Cairo Branch", legacy_id: "1" })
      expect((reps as Row[]).find((r) => r.code === "A1")).toMatchObject({ manager_id: id("07"), branch_id: b1.id, legacy_id: "21" })
      expect((reps as Row[]).find((r) => r.code === "A2")).toMatchObject({ manager_id: null, branch_id: null })
      const vendor = (await getContainer().resolve(VENDOR_MODULE).listVendors({ legacy_id: "101" }))[0]
      const assignment = async (t: string, tid: string) => (await list(`assignments?target_type=${t}&target_id=${tid}`)).assignments[0]
      expect(await assignment("vendor", vendor.id)).toMatchObject({ broker_id: id("K1"), branch_manager_id: id("07"), branch_id: b1.id })
      expect(await assignment("customer", plain.id)).toMatchObject({ account_manager_id: id("A1"), branch_manager_id: id("07"), branch_id: b1.id })
      expect(await assignment("company", co.id)).toMatchObject({ broker_id: null, branch_id: (branches as Row[]).find((b) => b.code === "FX-B2")!.id })

      const second = (await importWp({ container: getContainer(), args: [dir] })).sales_org
      expect(second).toMatchObject({ "branches updated/unchanged": 2, "reps updated": 4, "assignments company updated": 1 })
      expect((await list("branches")).count).toBe(2)
      expect((await list("reps")).count).toBe(4)
      expect((await list("assignments")).count).toBe(3)
    })
  },
})
