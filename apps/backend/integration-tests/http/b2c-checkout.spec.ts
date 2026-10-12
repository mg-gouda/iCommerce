import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import seedDefaults from "../../src/scripts/seed-defaults"

jest.setTimeout(240 * 1000)

const EMAILS = mkdtempSync(join(tmpdir(), "icommerce-emails-"))
process.env.EMAILS_DIR = EMAILS
process.env.BANK_TRANSFER_DETAILS = "Test Bank · IBAN EG00 1234"

const PASSWORD = "Passw0rd!"
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const emails = () => readdirSync(EMAILS)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let admin: string
    let key: string
    const auth = (token?: string) => ({ headers: { "x-publishable-api-key": key, ...(token && { authorization: `Bearer ${token}` }) } })

    beforeEach(async () => {
      await seedDefaults({ container: getContainer(), args: [] } as never)
      key = (await getContainer().resolve(Modules.API_KEY).listApiKeys({ title: "Retail storefront" }))[0].token
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
      const token = (await api.post("/auth/vendor/emailpass", { email, password: PASSWORD })).data.token
      const variants: string[] = []
      for (const [i, amount] of prices.entries()) {
        const p = await api.post(
          "/vendors/products",
          {
            title: `${name} item ${i}`,
            status: "published",
            options: [{ title: "Default", values: ["Default"] }],
            variants: [{ title: "Default", options: { Default: "Default" }, manage_inventory: false, prices: [{ currency_code: "usd", amount }] }],
          },
          auth(token),
        )
        variants.push(p.data.product.variants[0].id)
      }
      const opt = await api.post("/vendors/shipping-options", { name: `${name} courier`, kind: "flat", amount: 5 }, auth(token))
      expect(opt.status).toBe(201)
      expect(opt.data.shipping_option).toMatchObject({ kind: "flat", amount: 5 })
      return { id: data.vendor.id as string, token: token as string, variants }
    }

    async function customer(name: string, locale = "en") {
      const email = `${name}@buyer.test`
      const reg = await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })
      await api.post("/store/customers", { email, first_name: name, last_name: "Buyer", metadata: { locale } }, auth(reg.data.token))
      return { email, token: (await api.post("/auth/customer/emailpass", { email, password: PASSWORD })).data.token as string }
    }

    async function checkout(token: string, lines: string[], provider_id: string) {
      const region = (await api.get("/store/regions?fields=*payment_providers", auth())).data.regions.find((r: { name: string }) => r.name === "Egypt")
      expect(region.payment_providers.map((p: { id: string }) => p.id).sort()).toEqual(["pp_bank-transfer_bank-transfer", "pp_cod_cod"])
      let cart = (await api.post("/store/carts", { region_id: region.id }, auth(token))).data.cart
      for (const variant_id of lines) await api.post(`/store/carts/${cart.id}/line-items`, { variant_id, quantity: 2 }, auth(token))
      await api.post(
        `/store/carts/${cart.id}`,
        { shipping_address: { first_name: "Mona", last_name: "A.", address_1: "1 Nile St", city: "Giza", country_code: "eg", phone: "+20100" } },
        auth(token),
      )
      const groups = (await api.get(`/store/carts/${cart.id}/vendor-groups`, auth(token))).data.vendor_groups
      for (const g of groups) await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: g.shipping_options[0].id }, auth(token))
      cart = (await api.get(`/store/carts/${cart.id}`, auth(token))).data.cart
      const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, auth(token))).data.payment_collection
      await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id }, auth(token))
      const done = await api.post(`/store/carts/${cart.id}/complete`, {}, auth(token))
      expect(done.data.type).toBe("order")
      const order = done.data.order
      // order.placed subscriber runs async → wait for the split.
      for (let i = 0; i < 50; i++) {
        const o = await getContainer().resolve(Modules.ORDER).retrieveOrder(order.id, { select: ["id", "metadata"] })
        if (o.metadata?.vendor_order_ids) return { order, groups, children: o.metadata.vendor_order_ids as string[] }
        await sleep(200)
      }
      throw new Error("order was not split")
    }

    it("COD: 2 vendors → parent + 2 vendor orders, fulfil/deliver captures, isolation, returns, emails", async () => {
      const a = await vendor("Alpha", [10, 20])
      const b = await vendor("Beta", [7])
      const buyer = await customer("mona", "ar")
      const { order, groups, children } = await checkout(buyer.token, [...a.variants, ...b.variants], "pp_cod_cod")

      expect(groups).toHaveLength(2)
      expect(groups.every((g: { shipping_options: unknown[] }) => g.shipping_options.length === 1)).toBe(true)
      expect(children).toHaveLength(2)
      expect(order.total).toBe(2 * (10 + 20 + 7) + 2 * 5)

      const listA = (await api.get("/vendors/orders", auth(a.token))).data
      expect(listA.count).toBe(1)
      const oa = listA.orders[0]
      expect(oa).toMatchObject({ status: "pending", item_total: 60, shipping_total: 5, total: 65, payment: { provider_id: "pp_cod_cod", status: "awaiting" } })
      expect(oa.items.map((i: { title: string }) => i.title).sort()).toEqual(["Alpha item 0", "Alpha item 1"])
      expect(oa.buyer).toEqual({ first_name: "Mona", last_name: "A." })
      const ob = (await api.get("/vendors/orders", auth(b.token))).data.orders[0]
      expect(ob).toMatchObject({ total: 19, item_total: 14 })
      expect(oa.total + ob.total).toBe(order.total)
      expect((await api.get("/vendors/orders?status=shipped", auth(a.token))).data.count).toBe(0)

      // Isolation: B can't see or act on A's order.
      for (const call of [
        () => api.get(`/vendors/orders/${oa.id}`, auth(b.token)),
        () => api.post(`/vendors/orders/${oa.id}/fulfill`, { carrier: "X", tracking_number: "1" }, auth(b.token)),
        () => api.post(`/vendors/orders/${oa.id}/cancel`, { reason: "x" }, auth(b.token)),
      ]) {
        await expect(call()).rejects.toMatchObject({ response: { status: 404 } })
      }

      // Can't deliver before shipping; fulfil → shipped.
      await expect(api.post(`/vendors/orders/${oa.id}/deliver`, {}, auth(a.token))).rejects.toMatchObject({ response: { status: 400 } })
      const shipped = (await api.post(`/vendors/orders/${oa.id}/fulfill`, { carrier: "Aramex", tracking_number: "TRK1", tracking_url: "https://track.test/TRK1" }, auth(a.token))).data.order
      expect(shipped).toMatchObject({ status: "shipped", fulfillment: { carrier: "Aramex", tracking_number: "TRK1", tracking_url: "https://track.test/TRK1" } })
      await expect(api.post(`/vendors/orders/${oa.id}/cancel`, { reason: "late" }, auth(a.token))).rejects.toMatchObject({ response: { status: 400 } })

      const delivered = (await api.post(`/vendors/orders/${oa.id}/deliver`, {}, auth(a.token))).data.order
      expect(delivered).toMatchObject({ status: "delivered", payment: { status: "paid" } })
      const { data: [p] } = await getContainer().resolve("query").graph({
        entity: "order", fields: ["payment_collections.payments.captures.amount"], filters: { id: order.id },
      })
      expect(p.payment_collections?.[0]?.payments?.[0]?.captures?.map((c) => c?.amount)).toEqual([65])

      // B cancels its (unshipped) part.
      const canceled = (await api.post(`/vendors/orders/${ob.id}/cancel`, { reason: "Out of stock" }, auth(b.token))).data.order
      expect(canceled).toMatchObject({ status: "canceled", cancel_reason: "Out of stock" })

      // Customer view + return request (own order only).
      const other = await customer("eve")
      await expect(api.get(`/store/orders/${order.id}/vendor-orders`, auth(other.token))).rejects.toMatchObject({ response: { status: 404 } })
      const view = (await api.get(`/store/orders/${order.id}/vendor-orders`, auth(buyer.token))).data
      expect(view.vendor_orders.map((v: { status: string }) => v.status).sort()).toEqual(["canceled", "delivered"])
      expect(view.payment).toMatchObject({ provider_id: "pp_cod_cod", status: "partially_captured", bank_details: null })
      const parentItem = view.vendor_orders.find((v: { vendor: { id: string } }) => v.vendor.id === a.id).items[0].parent_item_id
      const bItem = view.vendor_orders.find((v: { vendor: { id: string } }) => v.vendor.id === b.id).items[0].parent_item_id
      await expect(api.post(`/store/orders/${order.id}/return-request`, { reason: "x", items: [{ item_id: bItem, quantity: 1 }] }, auth(buyer.token))).rejects.toMatchObject({ response: { status: 400 } })
      await expect(api.post(`/store/orders/${order.id}/return-request`, { reason: "x", items: [{ item_id: parentItem, quantity: 1 }] }, auth(other.token))).rejects.toMatchObject({ response: { status: 404 } })
      const rr = (await api.post(`/store/orders/${order.id}/return-request`, { reason: "Damaged", items: [{ item_id: parentItem, quantity: 1 }] }, auth(buyer.token))).data
      expect(rr.return_requests[0]).toMatchObject({ status: "requested", vendor_order_id: oa.id })
      const approved = (await api.post(`/vendors/orders/${oa.id}/return-request`, { action: "approve", note: "Send it back" }, auth(a.token))).data.order
      expect(approved.return_request).toMatchObject({ status: "approved", note: "Send it back", reason: "Damaged" })

      const sent = emails()
      for (const t of ["order-placed-mona@buyer.test", "vendor-new-order-alpha@vendor.test", "vendor-new-order-beta@vendor.test", "order-shipped-mona", "order-delivered-mona"]) {
        expect(sent.some((f) => f.includes(t))).toBe(true)
      }
      const placed = readFileSync(join(EMAILS, sent.find((f) => f.includes("order-placed-mona"))!), "utf8")
      expect(placed).toContain('dir="rtl"') // customer locale ar
      expect(readFileSync(join(EMAILS, sent.find((f) => f.includes("order-shipped-mona"))!), "utf8")).toContain("TRK1")
    })

    it("bank transfer: ship blocked until admin confirms, proof upload owner-only", async () => {
      const a = await vendor("Gamma", [30])
      const buyer = await customer("omar")
      const { order, children } = await checkout(buyer.token, a.variants, "pp_bank-transfer_bank-transfer")
      const [childId] = children

      await expect(api.post(`/vendors/orders/${childId}/fulfill`, { carrier: "X", tracking_number: "1" }, auth(a.token))).rejects.toMatchObject({
        response: { status: 400, data: { message: "Awaiting bank transfer confirmation." } },
      })
      const view = (await api.get(`/store/orders/${order.id}/vendor-orders`, auth(buyer.token))).data
      expect(view.payment).toMatchObject({ status: "authorized", bank_details: "Test Bank · IBAN EG00 1234", proof_uploaded_at: null })

      const form = () => {
        const f = new FormData()
        f.append("file", new Blob(["%PDF-1.4 receipt"], { type: "application/pdf" }), "receipt.pdf")
        return f
      }
      const eve = await customer("eve2")
      await expect(api.post(`/store/orders/${order.id}/payment-proof`, form(), auth(eve.token))).rejects.toMatchObject({ response: { status: 404 } })
      const up = await api.post(`/store/orders/${order.id}/payment-proof`, form(), auth(buyer.token))
      expect(up.data.payment_proof).toMatchObject({ filename: "receipt.pdf", mime_type: "application/pdf" })
      const proof = await api.get(`/admin/orders/${order.id}/payment-proof`, auth(admin))
      expect(proof.status).toBe(200)

      const confirmed = await api.post(`/admin/orders/${order.id}/confirm-transfer`, {}, auth(admin))
      expect(confirmed.data).toEqual({ order_id: order.id, captured: 65 })
      await expect(api.post(`/admin/orders/${order.id}/confirm-transfer`, {}, auth(admin))).rejects.toMatchObject({ response: { status: 400 } })
      expect((await api.get(`/store/orders/${order.id}/vendor-orders`, auth(buyer.token))).data.payment.status).toBe("captured")

      const shipped = await api.post(`/vendors/orders/${childId}/fulfill`, { carrier: "Bosta", tracking_number: "B1" }, auth(a.token))
      expect(shipped.data.order).toMatchObject({ status: "shipped", payment: { status: "paid" } })
      expect(emails().some((f) => f.includes("bank-transfer-omar"))).toBe(true)
    })

    it("vendor shipping options CRUD is scoped", async () => {
      const a = await vendor("Delta", [1])
      const b = await vendor("Epsilon", [1])
      const free = await api.post("/vendors/shipping-options", { name: "Free over 100", kind: "free_over", amount: 8, free_over: 100 }, auth(a.token))
      expect(free.data.shipping_option).toMatchObject({ kind: "free_over", amount: 8, free_over: 100 })
      const pickup = await api.post("/vendors/shipping-options", { name: "Pickup", kind: "pickup" }, auth(a.token))
      expect(pickup.data.shipping_option).toMatchObject({ kind: "pickup", amount: 0 })
      await expect(api.post("/vendors/shipping-options", { name: "x", kind: "free_over", amount: 1 }, auth(a.token))).rejects.toMatchObject({ response: { status: 400 } })
      expect((await api.get("/vendors/shipping-options", auth(a.token))).data.shipping_options).toHaveLength(3)
      await expect(api.delete(`/vendors/shipping-options/${pickup.data.shipping_option.id}`, auth(b.token))).rejects.toMatchObject({ response: { status: 404 } })
      await api.delete(`/vendors/shipping-options/${pickup.data.shipping_option.id}`, auth(a.token))
      expect((await api.get("/vendors/shipping-options", auth(a.token))).data.shipping_options).toHaveLength(2)
    })
  },
})
