import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { batchPriceListPricesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { companyRecipients, companySvc, contractGroupName, syncCompanyGroups } from "../../../../../lib/company"
import { sendEmail } from "../../../../../lib/emails"
import { shapeAccount } from "../../../../../lib/net-terms"
import { money, parse } from "../../../../../lib/parse"
import { ensurePriceList } from "../../../../../lib/wholesale"

type Ctx = { scope: MedusaContainer; id: string; body: unknown }
const Note = z.object({ note: z.string().trim().max(2000).optional() }).strict()
const Credit = z
  .object({ limit_usd: money, terms_days: z.union([z.literal(15), z.literal(30), z.literal(60)]), status: z.enum(["active", "on_hold"]).optional() })
  .strict()
const Prices = z.object({ prices: z.array(z.object({ variant_id: z.string(), amount: money }).strict()).max(1000) }).strict()

async function emailAdmins(scope: MedusaContainer, id: string, template: "company-verified" | "company-rejected", note?: string) {
  const company = await companySvc(scope).retrieveCompany(id)
  for (const r of await companyRecipients(scope, id)) {
    await sendEmail(scope, {
      to: r.email, template, locale: r.locale,
      data: { display_id: "", currency_code: "usd", company_name: company.name, note: note ?? null },
      key: `${template}-${id}-${Date.now()}`,
    })
  }
}

const ACTIONS: Record<string, (c: Ctx) => Promise<Record<string, unknown>>> = {
  async verify({ scope, id, body }) {
    const { note } = parse(Note, body)
    const company = await companySvc(scope).updateCompanies({ id, kyc_status: "verified", kyc_note: note ?? null, verified_at: new Date() })
    await syncCompanyGroups(scope, id)
    await emailAdmins(scope, id, "company-verified", note)
    return { company }
  },

  // Also = suspend for a verified company: members lose b2b_verified (wholesale prices, RFQ, net terms).
  async reject({ scope, id, body }) {
    const { note } = parse(Note, body)
    if (!note) throw new MedusaError(MedusaError.Types.INVALID_DATA, "note is required when rejecting")
    const company = await companySvc(scope).updateCompanies({ id, kyc_status: "rejected", kyc_note: note, verified_at: null })
    await syncCompanyGroups(scope, id)
    await emailAdmins(scope, id, "company-rejected", note)
    return { company }
  },

  async "credit-account"({ scope, id, body }) {
    const b = parse(Credit, body)
    const svc = companySvc(scope)
    const [existing] = await svc.listCreditAccounts({ company_id: id })
    const account = existing
      ? await svc.updateCreditAccounts({ id: existing.id, ...b })
      : await svc.createCreditAccounts({ company_id: id, ...b })
    return { credit_account: shapeAccount(account) }
  },

  // ponytail: contract prices are API-only (no admin UI); one price list per company, replaced wholesale.
  async "price-list"({ scope, id, body }) {
    const { prices } = parse(Prices, body)
    const list_id = await ensurePriceList(scope, `Contract ${id}`, contractGroupName(id))
    const old = await scope.resolve(Modules.PRICING).listPrices({ price_list_id: [list_id] } as never, { select: ["id"] })
    await batchPriceListPricesWorkflow(scope).run({
      input: { data: { id: list_id, delete: old.map((p) => p.id), update: [], create: prices.map((p) => ({ ...p, currency_code: "usd" })) } },
    })
    await syncCompanyGroups(scope, id)
    return { price_list_id: list_id, count: prices.length }
  },
}

// POST /admin/companies/:id/{verify|reject|credit-account|price-list}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const run = ACTIONS[req.params.action]
  if (!run) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown action "${req.params.action}"`)
  await companySvc(req.scope).retrieveCompany(req.params.id) // 404
  res.json(await run({ scope: req.scope, id: req.params.id, body: req.body }))
}
