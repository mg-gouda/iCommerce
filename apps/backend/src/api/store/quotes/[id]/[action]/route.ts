import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { callerMembership, companySvc, requireRole } from "../../../../../lib/company"
import { money, parse } from "../../../../../lib/parse"
import { acceptAndOrder, getQuoteOr404, need, notify, quoteSvc, shapeQuotes, transition } from "../../../../../lib/quotes"
import type { QuoteStatus } from "../../../../../modules/quote/models/quote"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { scope: MedusaContainer; q: Row; member: Row; body: unknown; name: string }

const OPEN: QuoteStatus[] = ["requested", "vendor_review", "offered", "negotiating", "pending_approval"]
const Body = z.object({ body: z.string().trim().min(1).max(5000) }).strict()
const Counter = z
  .object({ message: z.string().trim().min(1).max(5000), items: z.array(z.object({ id: z.string(), target_price: money }).strict()).optional() })
  .strict()
const Reject = z.object({ reason: z.string().trim().max(2000).optional() }).strict()

const ACTIONS: Record<string, (c: Ctx) => Promise<void>> = {
  async messages({ scope, q, body, name }) {
    const { body: text } = parse(Body, body)
    need(q, OPEN, "message")
    await transition(scope, q, {}, null, { author: "buyer", author_name: name, body: text })
    await notify(scope, q, "quote-message", ["vendor"], { body: text })
  },

  async counter({ scope, q, body, name }) {
    const { message, items = [] } = parse(Counter, body)
    need(q, ["offered"], "counter")
    const own = new Set((q.items as Row[]).map((i) => i.id))
    if (items.some((i) => !own.has(i.id))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown quote item.")
    if (items.length) await quoteSvc(scope).updateQuoteItems(items.map((i) => ({ id: i.id, target_price: i.target_price })))
    await transition(scope, q, { status: "negotiating" }, "countered", { author: "buyer", author_name: name, body: message })
    await notify(scope, q, "quote-countered", ["vendor"], { body: message })
  },

  // Buyers need an approver when the company has one; admins/approvers order directly.
  async accept({ scope, q, member }) {
    need(q, ["offered"], "accept")
    if (q.validity_until && new Date(q.validity_until) < new Date()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Offer expired.")
    const approvers = await companySvc(scope).listCompanyMembers({ company_id: q.company_id, role: "approver" } as never)
    if (member.role === "buyer" && approvers.length) {
      await transition(scope, q, { status: "pending_approval" }, "pending_approval")
      await notify(scope, q, "quote-pending-approval", ["approvers"])
      return
    }
    await acceptAndOrder(scope, q)
  },

  async approve({ scope, q, member }) {
    requireRole(member, ["approver", "admin"])
    need(q, ["pending_approval"], "approve")
    await acceptAndOrder(scope, q, { approved_by: member.id })
  },

  async reject({ scope, q, body, name }) {
    const { reason } = parse(Reject, body)
    need(q, OPEN, "reject")
    await transition(scope, q, { status: "rejected" }, "rejected", { author: "buyer", author_name: name, body: reason })
    await notify(scope, q, "quote-rejected", ["vendor"], { note: reason })
  },
}

// POST /store/quotes/:id/{messages|counter|accept|approve|reject}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const run = ACTIONS[req.params.action]
  if (!run) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown action "${req.params.action}"`)
  const { company, member } = await callerMembership(req)
  const q = await getQuoteOr404(req.scope, req.params.id, { company_id: company.id })
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email
  await run({ scope: req.scope, q, member, body: req.body, name })
  const fresh = await getQuoteOr404(req.scope, req.params.id, { company_id: company.id })
  res.json({ quote: (await shapeQuotes(req.scope, [fresh], true))[0] })
}
