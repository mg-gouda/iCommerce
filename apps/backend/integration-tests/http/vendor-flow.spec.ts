import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"

jest.setTimeout(120 * 1000)

const PASSWORD = "Passw0rd!"
const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())

const product = (title: string, status?: string) => ({
  title,
  ...(status && { status }),
  options: [{ title: "Default", values: ["Default"] }],
  variants: [{ title: "Default", options: { Default: "Default" }, prices: [{ currency_code: "usd", amount: 10 }] }],
  extra: { unit: "ton", min_qty: 5, hs_code: "7304" },
})

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let admin: string

    // Real admin login: register identity → create user → attach actor → login.
    beforeEach(async () => {
      const email = "admin@test.com"
      const reg = await api.post("/auth/user/emailpass/register", { email, password: PASSWORD })
      const user = await getContainer().resolve(Modules.USER).createUsers({ email })
      await getContainer()
        .resolve(Modules.AUTH)
        .updateAuthIdentities({ id: claims(reg.data.token).auth_identity_id, app_metadata: { user_id: user.id } })
      admin = (await api.post("/auth/user/emailpass", { email, password: PASSWORD })).data.token
    })

    async function applyVendor(name: string) {
      const email = `${name.toLowerCase()}@vendor.test`
      const reg = await api.post("/auth/vendor/emailpass/register", { email, password: PASSWORD })
      const applied = await api.post("/vendors", { name, country: "EG" }, bearer(reg.data.token))
      const login = await api.post("/auth/vendor/emailpass", { email, password: PASSWORD })
      return { id: applied.data.vendor.id as string, token: login.data.token as string, applied: applied.data }
    }

    it("apply → admin approve → vendor creates linked product", async () => {
      const a = await applyVendor("Acme")
      expect(a.applied.vendor).toMatchObject({ status: "pending", kyc_status: "none", handle: "acme" })
      expect(a.applied.user).toMatchObject({ email: "acme@vendor.test", role: "owner" })

      const me = await api.get("/vendors/me", bearer(a.token))
      expect(me.status).toBe(200)
      expect(me.data.vendor.id).toBe(a.id)
      await expect(api.get("/vendors/me")).rejects.toMatchObject({ response: { status: 401 } })

      // Pending vendor cannot publish.
      const pending = await api.post("/vendors/products", product("Pending pipe", "published"), bearer(a.token))
      expect(pending.data.product.status).toBe("proposed")

      const listed = await api.get("/admin/vendors?status=pending", bearer(admin))
      expect(listed.data.vendors.map((v: { id: string }) => v.id)).toContain(a.id)
      const approved = await api.post(`/admin/vendors/${a.id}/approve`, {}, bearer(admin))
      expect(approved.data.vendor).toMatchObject({ status: "approved", kyc_status: "verified" })

      const created = await api.post("/vendors/products", product("Steel pipe", "published"), bearer(a.token))
      expect(created.status).toBe(201)
      expect(created.data.product).toMatchObject({
        title: "Steel pipe",
        status: "published",
        product_extra: { unit: "ton", min_qty: 5, hs_code: "7304", b2c_enabled: true, origin_country: "EG" },
      })

      const { data } = await getContainer()
        .resolve("query")
        .graph({ entity: "product", fields: ["vendor.id"], filters: { id: created.data.product.id } })
      expect(data[0].vendor?.id).toBe(a.id)

      const mine = await api.get("/vendors/products", bearer(a.token))
      expect(mine.data.count).toBe(2)
    })

    it("vendor B cannot read, edit or delete vendor A's product", async () => {
      const a = await applyVendor("Alpha")
      const b = await applyVendor("Beta")
      const { data } = await api.post("/vendors/products", product("Alpha only"), bearer(a.token))
      const id = data.product.id

      for (const call of [
        () => api.get(`/vendors/products/${id}`, bearer(b.token)),
        () => api.post(`/vendors/products/${id}`, { title: "hijacked" }, bearer(b.token)),
        () => api.delete(`/vendors/products/${id}`, bearer(b.token)),
      ]) {
        await expect(call()).rejects.toMatchObject({ response: { status: 404 } })
      }
      expect((await api.get("/vendors/products", bearer(b.token))).data.count).toBe(0)
      expect((await api.get(`/vendors/products/${id}`, bearer(a.token))).data.product.title).toBe("Alpha only")
    })

    it("vendor B cannot touch A's variants or options through its own product", async () => {
      const a = await applyVendor("Gamma")
      const b = await applyVendor("Delta")
      const pa = (await api.post("/vendors/products", product("Gamma pot"), bearer(a.token))).data.product
      const pb = (await api.post("/vendors/products", product("Delta pot"), bearer(b.token))).data.product
      const [va, oa] = [pa.variants[0], pa.options[0]]

      for (const body of [
        { variants: [{ id: va.id, title: "stolen" }] },
        { options: [{ id: oa.id, title: "stolen", values: ["x"] }] },
      ]) {
        await expect(api.post(`/vendors/products/${pb.id}`, body, bearer(b.token))).rejects.toMatchObject({
          response: { status: 400 },
        })
      }
      const after = (await api.get(`/vendors/products/${pa.id}`, bearer(a.token))).data.product
      expect(after.variants).toHaveLength(1)
      expect(after.variants[0]).toMatchObject({ id: va.id, title: va.title })
      expect(after.options[0]).toMatchObject({ id: oa.id, title: oa.title })
    })

    it("CSV import reports the bad row and creates the good ones", async () => {
      await getContainer()
        .resolve(Modules.PRODUCT)
        .createProductCategories({ name: "Plastics", handle: "plastics", is_active: true })
      const a = await applyVendor("Importer")
      const csv = [
        "handle,title,description,category_handle,price_usd,compare_at_usd,unit,min_qty,qty_step,hs_code,b2b_only,image_urls",
        "good-1,Good one,desc,plastics,12.5,15,piece,10,5,3923,false,https://example.com/a.jpg",
        "bad-1,,desc,unknown-cat,abc,,piece,,,,,",
        "good-2,Good two,,,3,,ton,,,,true,",
      ].join("\n")
      const form = new FormData()
      form.append("file", new Blob([csv], { type: "text/csv" }), "products.csv")

      const res = await api.post("/vendors/products/import", form, bearer(a.token))
      expect(res.status).toBe(200)
      expect(res.data.created.map((c: { handle: string }) => c.handle)).toEqual(["good-1", "good-2"])
      expect(res.data.errors).toHaveLength(1)
      expect(res.data.errors[0]).toMatchObject({ row: 3, handle: "bad-1" })
      expect(res.data.errors[0].errors).toEqual(
        expect.arrayContaining(["title is required", 'unknown category_handle "unknown-cat"']),
      )
      const mine = await api.get("/vendors/products", bearer(a.token))
      expect(mine.data.count).toBe(2)
      // Pending vendor → imported products are drafts, never published.
      expect(mine.data.products.every((p: { status: string }) => p.status !== "published")).toBe(true)
    })

    it("public store vendor page: approved 200, pending 404", async () => {
      const key = await getContainer()
        .resolve(Modules.API_KEY)
        .createApiKeys({ title: "test", type: "publishable", created_by: "test" })
      const store = { headers: { "x-publishable-api-key": key.token } }
      const ok = await applyVendor("Shown")
      await applyVendor("Hidden")
      await api.post(`/admin/vendors/${ok.id}/approve`, {}, bearer(admin))

      const res = await api.get("/store/vendors/shown", store)
      expect(res.status).toBe(200)
      expect(res.data.vendor).toMatchObject({ handle: "shown", name: "Shown" })
      expect(res.data.vendor.tax_id).toBeUndefined()
      await expect(api.get("/store/vendors/hidden", store)).rejects.toMatchObject({ response: { status: 404 } })
    })
  },
})
