import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { money, parse } from "../../../../../lib/parse"
import { bad, getQuoteOr404, need, notify, quoteSvc, shapeQuotes, transition } from "../../../../../lib/quotes"
import type { QuoteStatus } from "../../../../../modules/quote/models/quote"
import { getCaller } from "../../../helpers"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { scope: MedusaContainer; q: Row; body: unknown; name: string }

const OFFERABLE: QuoteStatus[] = ["requested", "vendor_review", "negotiating"]
const Body = z.object({ body: z.string().trim().min(1).max(5000) }).strict()
const Offer = z
  .object({
    items: z.array(z.object({ id: z.string(), offered_unit_price: money, lead_time_days: z.number().int().min(0).max(3650).nullish() }).strict()).min(1),
    validity_until: z.coerce.date(),
    incoterm: z.string().trim().max(20).nullish(),
    note: z.string().trim().max(5000).optional(),
  })
  .strict()
const Reject = z.object({ note: z.string().trim().min(1).max(2000) }).strict()

const ACTIONS: Record<string, (c: Ctx) => Promise<void>> = {
  async messages({ scope, q, body, name }) {
    const { body: text } = parse(Body, body)
    need(q, [...OFFERABLE, "offered", "pending_approval"], "message")
    await transition(scope, q, {}, null, { author: "vendor", author_name: name, body: text })
    await notify(scope, q, "quote-message", ["requester"], { body: text })
  },

  // Prices for every item (once each) → total; validity must be in the future.
  async offer({ scope, q, body, name }) {
    const o = parse(Offer, body)
    need(q, OFFERABLE, "offer")
    const items = q.items as Row[]
    const ids = o.items.map((i) => i.id)
    if (new Set(ids).size !== ids.length || ids.length !== items.length || items.some((i) => !ids.includes(i.id))) {
      throw bad("Offer must price every quote item exactly once.")
    }
    if (o.validity_until <= new Date()) throw bad("validity_until must be in the future.")
    await quoteSvc(scope).updateQuoteItems(o.items.map((i) => ({ id: i.id, offered_unit_price: i.offered_unit_price, lead_time_days: i.lead_time_days ?? null })))
    const price = new Map(o.items.map((i) => [i.id, i.offered_unit_price]))
    // Cents-rounded sum of quantity × unit price (quantities may be decimal).
    const total = Math.round(items.reduce((s, i) => s + Number(i.quantity) * price.get(i.id)!, 0) * 100) / 100
    await transition(
      scope, q,
      { status: "offered", total, validity_until: o.validity_until, ...(o.incoterm !== undefined && { incoterm: o.incoterm }) },
      "offered",
      { author: "vendor", author_name: name, body: o.note },
    )
    await notify(scope, q, "quote-offered", ["requester"], { body: o.note })
  },

  async reject({ scope, q, body, name }) {
    const { note } = parse(Reject, body)
    need(q, [...OFFERABLE, "offered"], "reject")
    await transition(scope, q, { status: "rejected" }, "rejected", { author: "vendor", author_name: name, body: note })
    await notify(scope, q, "quote-rejected", ["requester"], { note })
  },
}

// POST /vendors/quotes/:id/{messages|offer|reject}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const run = ACTIONS[req.params.action]
  if (!run) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown action "${req.params.action}"`)
  const { vendor } = await getCaller(req)
  const q = await getQuoteOr404(req.scope, req.params.id, { vendor_id: vendor.id })
  await run({ scope: req.scope, q, body: req.body, name: vendor.name })
  const fresh = await getQuoteOr404(req.scope, req.params.id, { vendor_id: vendor.id })
  res.json({ quote: (await shapeQuotes(req.scope, [fresh], true))[0] })
}
