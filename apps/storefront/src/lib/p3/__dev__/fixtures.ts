// DEV ONLY (P3_FIXTURES=1, never in production): in-memory stand-in for the P3 store API while the backend is built.
// State lives in a JSON file (P3_FIXTURE_FILE) so a test script can play admin / vendor by editing it.
// ponytail: happy paths + the errors the UI shows; not a backend.
import { readFileSync, writeFileSync } from "node:fs"
import type { Company, Credit, Invitation, Member, Quote, QuoteItem, Tier } from "../types"

type Db = { companies: { company: Company; members: Member[]; invitations: Invitation[]; credit: Credit }[]; quotes: (Quote & { company_id: string })[] }
const FILE = process.env.P3_FIXTURE_FILE ?? "/tmp/p3-fixtures.json"
const load = (): Db => { try { return JSON.parse(readFileSync(FILE, "utf8")) } catch { return { companies: [], quotes: [] } } }
const save = (db: Db) => writeFileSync(FILE, JSON.stringify(db, null, 1))
const fail = (status: number, message: string) => Object.assign(new Error(message), { status })
const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`
const now = () => new Date().toISOString()
const claims = (authz?: string) => {
  if (!authz) throw fail(401, "Unauthorized")
  const c = JSON.parse(Buffer.from(authz.split(".")[1], "base64url").toString())
  return { customer_id: c.actor_id as string, email: `${c.actor_id}@example.com` }
}
// Real names/emails for new members (the JWT carries neither).
async function person(authz: string) {
  const { sdk } = await import("@icommerce/sdk")
  const { customer } = await sdk.store.customer.retrieve({ fields: "email,first_name,last_name" }, { authorization: authz })
  return { email: customer.email, first_name: customer.first_name ?? null, last_name: customer.last_name ?? null }
}
const TIERS: Tier[] = [{ min_qty: 10, unit_price_usd: 9.5 }, { min_qty: 50, unit_price_usd: 8.9 }, { min_qty: 200, unit_price_usd: 8.1 }]

export async function fixture(path: string, init: { method?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, authz?: string): Promise<unknown> {
  const db = load()
  const m = (init.method ?? "GET") + " " + path
  const me = () => {
    const { customer_id } = claims(authz)
    const c = db.companies.find((x) => x.members.some((y) => y.customer_id === customer_id))
    if (!c) throw fail(404, "Company not found")
    return { c, member: c.members.find((y) => y.customer_id === customer_id)! }
  }
  const admin = () => { const r = me(); if (r.member.role !== "admin") throw fail(403, "Only company admins can do this."); return r }
  const b = init.body ?? {}
  const done = <T>(v: T) => (save(db), v)
  let r: RegExpMatchArray | null

  if (m === "GET /store/companies/me") { const { c, member } = me(); return { company: c.company, member } }
  if (m === "POST /store/companies") {
    const { customer_id } = claims(authz)
    if (db.companies.some((x) => x.members.some((y) => y.customer_id === customer_id))) throw fail(400, "You already belong to a company.")
    const company: Company = {
      id: id("comp"), name: String(b.name), handle: String(b.name).toLowerCase().replace(/\W+/g, "-"), country: String(b.country),
      city: (b.city as string) ?? null, address: (b.address as string) ?? null, phone: (b.phone as string) ?? null,
      tax_id: null, commercial_reg_no: null, export_card_no: null, kyc_status: "none", kyc_note: null, kyc_files: null, verified_at: null, payment_mode: "upfront",
    }
    const member: Member = { id: id("cmem"), customer_id, ...(await person(authz!)), role: "admin", created_at: now() }
    db.companies.push({ company, members: [member], invitations: [], credit: { credit_account: null, used: 0, available: 0, invoices: [] } })
    return done({ company, member })
  }
  if (m === "POST /store/companies/me") { const { c, member } = admin(); Object.assign(c.company, b); return done({ company: c.company, member }) }
  if (m === "GET /store/companies/me/members") { const { c, member } = me(); return { members: c.members, invitations: member.role === "admin" ? c.invitations.filter((i) => !i.accepted_at) : [] } }
  if (m === "POST /store/companies/me/invitations") {
    const { c } = admin()
    if (c.members.some((x) => x.email === b.email)) throw fail(400, "This email is already a member.")
    const invitation: Invitation = { id: id("cinv"), email: String(b.email), role: b.role as Invitation["role"], expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), accepted_at: null, created_at: now() }
    c.invitations.push(invitation)
    return done({ invitation })
  }
  if (m === "POST /store/companies/invitations/accept") {
    const { customer_id } = claims(authz)
    const c = db.companies.find((x) => x.invitations.some((i) => i.id === b.token && !i.accepted_at))
    const inv = c?.invitations.find((i) => i.id === b.token)
    if (!c || !inv) throw fail(400, "This invitation is invalid, expired or already used.")
    if (db.companies.some((x) => x.members.some((y) => y.customer_id === customer_id))) throw fail(400, "You already belong to a company.")
    inv.accepted_at = now()
    const member: Member = { id: id("cmem"), customer_id, ...(await person(authz!)), role: inv.role, created_at: now() }
    c.members.push(member)
    return done({ company: c.company, member })
  }
  if ((r = m.match(/^(POST|DELETE) \/store\/companies\/me\/members\/(.+)$/))) {
    const { c } = admin()
    const target = c.members.find((x) => x.id === r![2])
    if (!target) throw fail(404, "Member not found")
    const admins = c.members.filter((x) => x.role === "admin")
    if (target.role === "admin" && admins.length === 1 && (r[1] === "DELETE" || b.role !== "admin")) throw fail(400, "A company needs at least one admin.")
    if (r[1] === "DELETE") { c.members = c.members.filter((x) => x !== target); return done({ id: target.id, object: "company_member", deleted: true }) }
    target.role = b.role as Member["role"]
    return done({ member: target })
  }
  if (m === "GET /store/companies/me/credit") return me().c.credit
  if ((r = m.match(/^GET \/store\/products\/(.+)\/wholesale-tiers$/))) {
    let verified = false
    try { verified = me().c.company.kyc_status === "verified" } catch {}
    return verified ? { tiers: TIERS, gated: false } : { tiers: null, gated: true }
  }

  if (m === "POST /store/quotes") {
    const { c, member } = me()
    if (c.company.kyc_status !== "verified") throw fail(400, "Company must be verified to request quotes.")
    const { listProducts } = await import("../../store")
    const items = b.items as { product_id?: string; title?: string; vendor_id?: string; quantity: number; unit?: string; target_price?: number }[]
    const groups = new Map<string, { vendor: Quote["vendor"]; items: QuoteItem[] }>()
    for (const it of items) {
      const p = it.product_id ? (await listProducts({ id: [it.product_id], limit: 1 })).products[0] : null
      if (it.product_id && !p) throw fail(400, "Unknown product.")
      const vendor = p?.vendor ? { id: p.vendor.handle, name: p.vendor.name, handle: p.vendor.handle } : { id: it.vendor_id!, name: it.vendor_id!, handle: it.vendor_id! }
      if (!groups.has(vendor.id)) groups.set(vendor.id, { vendor, items: [] })
      groups.get(vendor.id)!.items.push({
        id: id("quoitm"), product_id: p?.id ?? null, variant_id: p?.variants[0]?.id ?? null, title: p?.title ?? it.title!, quantity: it.quantity,
        unit: it.unit ?? p?.product_extra?.unit ?? null, target_price: it.target_price ?? null, offered_unit_price: null, lead_time_days: null,
      })
    }
    const rfq_id = id("rfq")
    const quotes = [...groups.values()].map((g) => ({
      id: id("quo"), rfq_id, status: "requested" as const, currency_code: "usd", company_id: c.company.id, vendor: g.vendor,
      requester: { id: member.id, email: member.email, first_name: member.first_name, last_name: member.last_name },
      notes: (b.notes as string) || null, incoterm: (b.incoterm as string) || null, validity_until: null, total: null, order_id: null, approved_by: null,
      items: g.items, messages: [{ id: id("quomsg"), author: "system" as const, author_name: null, body: "Request sent to the supplier.", created_at: now() }], created_at: now(),
    }))
    db.quotes.unshift(...quotes)
    return done({ rfq_id, quotes })
  }
  const mine = () => { const { c } = me(); return db.quotes.filter((q) => q.company_id === c.company.id) }
  if (m === "GET /store/quotes") {
    const q = mine().filter((x) => (!init.query?.status || x.status === init.query.status) && (!init.query?.rfq_id || x.rfq_id === init.query.rfq_id))
    return { quotes: q.map((x) => ({ ...x, messages: undefined })), count: q.length }
  }
  if ((r = m.match(/^(GET|POST) \/store\/quotes\/([^/]+)(?:\/(\w+))?$/))) {
    const { member } = me()
    const q = mine().find((x) => x.id === r![2])
    if (!q) throw fail(404, "Quote not found")
    const sys = (body: string, author: "buyer" | "system" = "system") =>
      q.messages!.push({ id: id("quomsg"), author, author_name: author === "buyer" ? member.email : null, body, created_at: now() })
    const need = (...s: Quote["status"][]) => { if (!s.includes(q.status)) throw fail(400, `Quote is ${q.status}; this action isn't possible now.`) }
    const act = r[3]
    if (!act) return { quote: q }
    if (act === "messages") sys(String(b.body), "buyer")
    else if (act === "counter") {
      need("offered")
      for (const it of (b.items as { id: string; target_price: number }[]) ?? []) { const x = q.items.find((y) => y.id === it.id); if (x) x.target_price = it.target_price }
      q.status = "negotiating"; sys(String(b.message), "buyer")
    } else if (act === "accept") {
      need("offered")
      if (q.validity_until && new Date(q.validity_until) < new Date()) throw fail(400, "Offer expired.")
      const hasApprovers = db.companies.find((x) => x.company.id === q.company_id)!.members.some((y) => y.role === "approver")
      if (member.role === "buyer" && hasApprovers) { q.status = "pending_approval"; sys("Accepted by buyer, waiting for approval.") }
      else { q.status = "ordered"; q.order_id = id("order"); sys("Offer accepted. Order created.") }
    } else if (act === "approve") {
      need("pending_approval")
      if (member.role === "buyer") throw fail(403, "Only approvers can approve.")
      q.status = "ordered"; q.order_id = id("order"); q.approved_by = member.id; sys("Approved. Order created.")
    } else if (act === "reject") { need("requested", "vendor_review", "negotiating", "offered", "pending_approval"); q.status = "rejected"; sys(String(b.reason || "Rejected by buyer.")) }
    return done({ quote: q })
  }
  throw fail(404, `fixture: no route ${m}`)
}

export async function fixtureUpload(path: string, body: FormData, authz?: string) {
  if (path !== "/store/companies/me/kyc") return { status: 404, message: "fixture: no route" }
  const db = load()
  const { customer_id } = claims(authz)
  const c = db.companies.find((x) => x.members.some((y) => y.customer_id === customer_id && y.role === "admin"))
  if (!c) return { status: 404, message: "Company not found" }
  const files = body.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  Object.assign(c.company, {
    tax_id: body.get("tax_id"), commercial_reg_no: body.get("commercial_reg_no"), export_card_no: body.get("export_card_no") || null,
    kyc_status: "submitted", kyc_note: null, kyc_files: files.map((f) => ({ id: `private-${f.name}`, filename: f.name, mime_type: f.type })),
  })
  save(db)
  return { status: 200 }
}
