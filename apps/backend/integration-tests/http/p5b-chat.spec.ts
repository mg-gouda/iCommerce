import { createHmac } from "node:crypto"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import seedDefaults from "../../src/scripts/seed-defaults"
import { FEE_MODULE } from "../../src/modules/fee"
import type FeeModuleService from "../../src/modules/fee/service"

jest.setTimeout(300 * 1000)

const EMAILS = mkdtempSync(join(tmpdir(), "icommerce-chat-emails-"))
process.env.EMAILS_DIR = EMAILS

// TalkJS stub: records every call, answers PUT with {} and GET lists from `lists`.
const APP = "app_test"
const SECRET = "sk_test_stub_secret_value"
type Call = { method: string; path: string; auth?: string; body: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
const calls: Call[] = []
const lists: Record<string, unknown[]> = {}
let stub: Server
const env = { TALKJS_APP_ID: APP, TALKJS_SECRET_KEY: SECRET }
Object.assign(process.env, env)

const PASSWORD = "Passw0rd!"
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const status = (n: number) => ({ response: { status: n } })
const put = (path: string) => calls.filter((c) => c.method === "PUT" && c.path === `/v1/${APP}${path}`).at(-1)?.body

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let admin: string
    let retail: string
    const auth = (token?: string) => ({ headers: { "x-publishable-api-key": retail, ...(token && { authorization: `Bearer ${token}` }) } })

    beforeAll(async () => {
      stub = createServer((req, res) => {
        let raw = ""
        req.on("data", (c) => (raw += c))
        req.on("end", () => {
          const url = new URL(req.url!, "http://x")
          calls.push({ method: req.method!, path: url.pathname, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} })
          res.setHeader("content-type", "application/json")
          if (url.pathname.includes("/boom")) return res.writeHead(500).end("{}")
          res.end(JSON.stringify(req.method === "GET" ? { data: lists[url.pathname] ?? [] } : {}))
        })
      })
      await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r))
      process.env.TALKJS_API_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`
    })
    afterAll(() => new Promise((r) => stub.close(r)))

    beforeEach(async () => {
      calls.length = 0
      await seedDefaults({ container: getContainer(), args: [] } as never)
      const fees = getContainer().resolve<FeeModuleService>(FEE_MODULE)
      await fees.deleteFeeTiers((await fees.listFeeTiers({})).map((t) => t.id))
      retail = (await getContainer().resolve(Modules.API_KEY).listApiKeys({ title: "Retail storefront" }))[0].token
      const email = "admin@test.com"
      const reg = await api.post("/auth/user/emailpass/register", { email, password: PASSWORD })
      const user = await getContainer().resolve(Modules.USER).createUsers({ email })
      await getContainer().resolve(Modules.AUTH).updateAuthIdentities({ id: claims(reg.data.token).auth_identity_id, app_metadata: { user_id: user.id } })
      admin = (await api.post("/auth/user/emailpass", { email, password: PASSWORD })).data.token
    })

    async function vendor(name: string, status: "published" | "draft" = "published") {
      const email = `${name.toLowerCase()}@vendor.test`
      const reg = await api.post("/auth/vendor/emailpass/register", { email, password: PASSWORD })
      const { data } = await api.post("/vendors", { name, country: "EG" }, auth(reg.data.token))
      await api.post(`/admin/vendors/${data.vendor.id}/approve`, {}, auth(admin))
      const business = (await api.get("/admin/plans", auth(admin))).data.plans.find((p: { handle: string }) => p.handle === "business")
      await api.post("/admin/vendor-subscriptions", { vendor_id: data.vendor.id, plan_id: business.id }, auth(admin))
      const token = (await api.post("/auth/vendor/emailpass", { email, password: PASSWORD })).data.token as string
      const mk = async (s: string) =>
        (await api.post("/vendors/products", {
          title: `${name} ${s}`, status: s,
          options: [{ title: "Default", values: ["Default"] }],
          variants: [{ title: "Default", options: { Default: "Default" }, manage_inventory: false, prices: [{ currency_code: "usd", amount: 10 }] }],
        }, auth(token))).data.product
      const p = await mk(status)
      const draft = await mk("draft")
      await api.post("/vendors/shipping-options", { name: `${name} courier`, kind: "flat", amount: 5 }, auth(token))
      return { id: data.vendor.id as string, email, token, product: p.id as string, variant: p.variants[0].id as string, draft: draft.id as string }
    }

    async function customer(name: string, locale = "en") {
      const email = `${name}@buyer.test`
      const reg = await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })
      const c = await api.post("/store/customers", { email, first_name: name, last_name: "Buyer", metadata: { locale } }, auth(reg.data.token))
      return { email, id: c.data.customer.id as string, token: (await api.post("/auth/customer/emailpass", { email, password: PASSWORD })).data.token as string }
    }

    async function order(buyer: { token: string }, variant_id: string) {
      const region = (await api.get("/store/regions", auth())).data.regions.find((r: { name: string }) => r.name === "Egypt")
      const cart = (await api.post("/store/carts", { region_id: region.id }, auth(buyer.token))).data.cart
      await api.post(`/store/carts/${cart.id}/line-items`, { variant_id, quantity: 1 }, auth(buyer.token))
      await api.post(`/store/carts/${cart.id}`, { shipping_address: { first_name: "Sara", last_name: "N.", address_1: "1 Nile St", city: "Giza", country_code: "eg", phone: "+20100" } }, auth(buyer.token))
      for (const g of (await api.get(`/store/carts/${cart.id}/vendor-groups`, auth(buyer.token))).data.vendor_groups) {
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: g.shipping_options[0].id }, auth(buyer.token))
      }
      const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, auth(buyer.token))).data.payment_collection
      await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_cod_cod" }, auth(buyer.token))
      const o = (await api.post(`/store/carts/${cart.id}/complete`, {}, auth(buyer.token))).data.order
      for (let i = 0; i < 60; i++) {
        const ids = (await getContainer().resolve(Modules.ORDER).retrieveOrder(o.id, { select: ["metadata"] })).metadata?.vendor_order_ids as string[]
        if (ids?.length) return { parent: o, child: ids[0] }
        await sleep(200)
      }
      throw new Error("no split")
    }

    async function company(name: string, members: { name: string; role: "buyer" | "approver" }[]) {
      const owner = await customer(`${name}-admin`, "ar")
      const created = await api.post("/store/companies", { name: `${name} Imports`, country: "eg", city: "Cairo", address: "1 Nile St", phone: "+20100" }, auth(owner.token))
      const out: Record<string, Awaited<ReturnType<typeof customer>>> = { admin: owner }
      for (const m of members) {
        const c = await customer(m.name)
        await api.post("/store/companies/me/invitations", { email: c.email, role: m.role }, auth(owner.token))
        const file = readdirSync(EMAILS).find((f) => f.includes("company-invite") && f.includes(c.email))!
        const token = readFileSync(join(EMAILS, file), "utf8").match(/token=([\w-]+)/)![1]
        await api.post("/store/companies/invitations/accept", { token }, auth(c.token))
        out[m.name] = c
      }
      const f = new FormData()
      f.append("tax_id", "TAX-1")
      f.append("commercial_reg_no", "CR-1")
      f.append("files", new Blob(["%PDF-1.4 cr"], { type: "application/pdf" }), "cr.pdf")
      await api.post("/store/companies/me/kyc", f, auth(owner.token))
      await api.post(`/admin/companies/${created.data.company.id}/verify`, {}, auth(admin))
      return out
    }

    const open = (token: string, kind: string, ref_id: string, path = "/store") => api.post(`${path}/chat/conversations`, { kind, ref_id }, auth(token))

    it("access matrix, token, upserts", async () => {
      const v = await vendor("Helwan")
      const other = await vendor("Nile")
      const sara = await customer("sara", "ar")
      const omar = await customer("omar")

      // Guests → 401.
      await expect(api.get("/store/chat/session", auth())).rejects.toMatchObject(status(401))

      // Product: published only; vendors can't start one.
      const r = (await open(sara.token, "product", v.product)).data
      expect(r).toMatchObject({ app_id: APP, user_id: `c_${sara.id}`, conversation_id: `prd_${v.product}_${sara.id}` })
      await expect(open(sara.token, "product", v.draft)).rejects.toMatchObject(status(404))
      await expect(open(sara.token, "product", "prod_nope")).rejects.toMatchObject(status(404))
      await expect(open(v.token, "product", v.product, "/vendors")).rejects.toMatchObject(status(400))
      await expect(open(sara.token, "nope", v.product)).rejects.toMatchObject(status(400))

      // Token: HS256 over header.payload with the secret, sub/iss/exp ≈ 1 h; secret never in a response.
      const [h, p, sig] = r.token.split(".")
      expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" })
      expect(sig).toBe(createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url"))
      const c = claims(r.token)
      expect(c).toMatchObject({ tokenType: "user", iss: APP, sub: `c_${sara.id}` })
      expect(Math.abs(c.exp - Date.now() / 1000 - 3600)).toBeLessThan(60)
      expect(JSON.stringify(r)).not.toContain(SECRET)
      expect(calls.every((x) => x.auth === `Bearer ${SECRET}`)).toBe(true)

      // Upserts (§1–2).
      expect(put(`/users/c_${sara.id}`)).toEqual({ name: "sara Buyer", email: [sara.email], role: "buyer", locale: "ar" })
      expect(put(`/users/v_${v.id}`)).toMatchObject({ name: "Helwan", email: [v.email], role: "vendor" })
      expect(put(`/users/v_${v.id}`)?.locale).toBeUndefined() // other party keeps its own locale
      expect(put(`/conversations/prd_${v.product}_${sara.id}`)).toEqual({
        participants: [`c_${sara.id}`, `v_${v.id}`],
        subject: "Helwan published",
        custom: { kind: "product", ref_id: v.product, vendor_id: v.id, customer_id: sara.id },
      })
      // Page locale wins for the caller.
      const s = (await api.get("/store/chat/session?lang=en", auth(sara.token))).data
      expect(s).toEqual({ app_id: APP, user_id: `c_${sara.id}`, token: expect.any(String) })
      expect(put(`/users/c_${sara.id}`)?.locale).toBe("en")

      // Order: own child order only (buyer + its vendor).
      const { parent, child } = await order(sara, v.variant)
      expect((await open(sara.token, "order", child)).data.conversation_id).toBe(`ord_${child}`)
      expect(put(`/conversations/ord_${child}`)).toMatchObject({
        participants: [`c_${sara.id}`, `v_${v.id}`], subject: `Order #${parent.display_id}`,
        custom: { kind: "order", ref_id: child, vendor_id: v.id, customer_id: sara.id },
      })
      await expect(open(omar.token, "order", child)).rejects.toMatchObject(status(404))
      await expect(open(sara.token, "order", parent.id)).rejects.toMatchObject(status(404)) // parent ≠ child order
      const vr = (await open(v.token, "order", child, "/vendors")).data
      expect(vr).toMatchObject({ user_id: `v_${v.id}`, conversation_id: `ord_${child}` })
      await expect(open(other.token, "order", child, "/vendors")).rejects.toMatchObject(status(404))
      expect((await api.get("/vendors/chat/session", auth(v.token))).data.user_id).toBe(`v_${v.id}`)
    })

    it("quote chats: requester, approvers, vendor; nobody else", async () => {
      const v = await vendor("Helwan")
      const other = await vendor("Nile")
      const co = await company("delta", [{ name: "sara", role: "buyer" }, { name: "omar", role: "approver" }, { name: "lina", role: "buyer" }])
      const outsider = await company("acme", [])
      const rfq = (await api.post("/store/quotes", { items: [{ variant_id: v.variant, quantity: 10 }] }, auth(co.sara.token))).data
      const q = rfq.quotes[0]
      const id = `qt_${q.id}`

      expect((await open(co.sara.token, "quote", q.id)).data.conversation_id).toBe(id)
      expect(put(`/conversations/${id}`)).toMatchObject({
        participants: [`c_${co.sara.id}`, `v_${v.id}`], subject: `Quote Q-${q.id.slice(-6).toUpperCase()}`,
        custom: { kind: "quote", ref_id: q.id, vendor_id: v.id, customer_id: co.sara.id },
      })
      // Approver joins on first open; the conversation stays the requester's.
      expect((await open(co.omar.token, "quote", q.id)).data.user_id).toBe(`c_${co.omar.id}`)
      expect(put(`/conversations/${id}`)).toMatchObject({ participants: [`c_${co.sara.id}`, `v_${v.id}`, `c_${co.omar.id}`], custom: { customer_id: co.sara.id } })
      await open(co.admin.token, "quote", q.id)
      await expect(open(co.lina.token, "quote", q.id)).rejects.toMatchObject(status(404)) // plain buyer, not requester
      await expect(open(outsider.admin.token, "quote", q.id)).rejects.toMatchObject(status(404))
      await expect(open(v.token, "quote", q.id, "/vendors")).resolves.toMatchObject({ status: 200 })
      await expect(open(other.token, "quote", q.id, "/vendors")).rejects.toMatchObject(status(404))
    })

    it("unread, admin routes, upstream errors, keys unset", async () => {
      const v = await vendor("Helwan")
      const sara = await customer("sara")
      lists[`/v1/${APP}/users/v_${v.id}/conversations`] = [{ id: "a" }, { id: "b" }]
      expect((await api.get("/vendors/chat/unread", auth(v.token))).data).toEqual({ count: 2 })
      expect(calls.at(-1)!.path).toBe(`/v1/${APP}/users/v_${v.id}/conversations`)
      expect((await api.get("/store/chat/unread", auth(sara.token))).data).toEqual({ count: 0 })

      // Admin only.
      const conv = (id: string, kind: string, at: number) => ({ id, subject: id, custom: { kind, vendor_id: v.id, customer_id: sara.id }, participants: { x: {} }, createdAt: at, lastMessage: null })
      lists[`/v1/${APP}/conversations`] = [conv("old", "order", 1), conv("new", "product", 2)]
      for (const t of [v.token, sara.token, undefined]) {
        await expect(api.get("/admin/chat/conversations", auth(t))).rejects.toMatchObject(status(401))
        await expect(api.get("/admin/chat/conversations/x/messages", auth(t))).rejects.toMatchObject(status(401))
        await expect(api.post("/admin/chat/conversations/x/join", {}, auth(t))).rejects.toMatchObject(status(401))
      }
      const list = (await api.get("/admin/chat/conversations", auth(admin))).data
      expect(list.conversations.map((c: { id: string }) => c.id)).toEqual(["new", "old"])
      expect((await api.get("/admin/chat/conversations?kind=order", auth(admin))).data.conversations.map((c: { id: string }) => c.id)).toEqual(["old"])
      lists[`/v1/${APP}/conversations/new/messages`] = [{ id: "m1", senderId: `c_${sara.id}`, type: "UserMessage", text: "hi", createdAt: 5 }]
      expect((await api.get("/admin/chat/conversations/new/messages", auth(admin))).data.messages).toEqual([
        { id: "m1", sender_id: `c_${sara.id}`, type: "UserMessage", text: "hi", created_at: new Date(5).toISOString() },
      ])
      const j = (await api.post("/admin/chat/conversations/new/join", {}, auth(admin))).data
      expect(j).toMatchObject({ app_id: APP, user_id: "ops" })
      expect(put("/conversations/new/participants/ops")).toEqual({ access: "ReadWrite", notify: true })
      expect(put("/users/ops")).toMatchObject({ name: "iCommerce Support", role: "ops" })

      // Upstream failure → 502 chat_upstream.
      await expect(api.post("/admin/chat/conversations/boom/join", {}, auth(admin))).rejects.toMatchObject({ response: { status: 502, data: { type: "chat_upstream" } } })

      // Keys unset → 503 chat_disabled everywhere.
      delete process.env.TALKJS_SECRET_KEY
      try {
        await expect(api.get("/store/chat/session", auth(sara.token))).rejects.toMatchObject({ response: { status: 503, data: { type: "chat_disabled" } } })
        await expect(open(sara.token, "product", v.product)).rejects.toMatchObject(status(503))
        await expect(api.get("/vendors/chat/unread", auth(v.token))).rejects.toMatchObject(status(503))
      } finally {
        Object.assign(process.env, env)
      }
    })
  },
})
