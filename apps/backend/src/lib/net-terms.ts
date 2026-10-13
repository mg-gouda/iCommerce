import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { companyRecipients, companySvc } from "./company"
import { sendEmail } from "./emails"

const usd = (n: number) => `USD ${n.toFixed(2)}`
const notAllowed = (msg: string) => new MedusaError(MedusaError.Types.INVALID_DATA, msg)

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const shapeAccount = (a: Row) => ({
  id: a.id, company_id: a.company_id, limit_usd: Number(a.limit_usd), terms_days: a.terms_days, status: a.status,
})
export const shapeInvoice = (i: Row) => ({
  id: i.id, company_id: i.company_id, order_id: i.order_id, display_id: i.display_id, amount: Number(i.amount), currency_code: i.currency_code,
  due_date: i.due_date, status: i.status, paid_at: i.paid_at, created_at: i.created_at,
})

/** Limit, used (open + overdue invoices), available, invoices of a company. */
export async function creditSummary(scope: MedusaContainer, company_id: string) {
  const svc = companySvc(scope)
  const [account] = await svc.listCreditAccounts({ company_id })
  const invoices = await svc.listInvoices({ company_id }, { order: { created_at: "DESC" } })
  const used = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.amount), 0)
  const limit = account ? Number(account.limit_usd) : 0
  return { account, invoices, used, available: Math.max(0, limit - used), limit }
}

/**
 * Net terms allowed iff: customer in a verified company, active credit account, no overdue invoice,
 * outstanding + amount ≤ limit. Throws 400 otherwise. Returns the company + terms.
 */
export async function assertNetTerms(scope: MedusaContainer, customer_id: string | null | undefined, amount: number) {
  const [member] = customer_id ? await companySvc(scope).listCompanyMembers({ customer_id }, { relations: ["company"] }) : []
  if (!member || member.company.kyc_status !== "verified") throw notAllowed("Net terms not available for this account.")
  const c = await creditSummary(scope, member.company.id)
  if (!c.account || c.account.status !== "active") throw notAllowed("Net terms not available for this account.")
  if (c.invoices.some((i) => i.status === "overdue")) throw notAllowed("Net terms not available: overdue invoice.")
  if (Math.round((c.used + amount) * 100) > Math.round(c.limit * 100)) throw notAllowed(`Credit limit exceeded: available ${usd(c.available)}.`)
  return { company: member.company, account: c.account }
}

/**
 * Daily: open invoices past due → overdue, account → on_hold, reminder to company admins for every overdue invoice
 * (idempotency key per invoice per day → at most one reminder a day).
 */
export async function flagOverdue(scope: MedusaContainer, now = new Date()) {
  const svc = companySvc(scope)
  const late = await svc.listInvoices({ status: "open", due_date: { $lt: now } })
  if (late.length) await svc.updateInvoices(late.map((i) => ({ id: i.id, status: "overdue" as const })))
  const overdue = await svc.listInvoices({ status: "overdue" })
  const companies = [...new Set(overdue.map((i) => i.company_id))]
  const accounts = companies.length ? await svc.listCreditAccounts({ company_id: companies, status: "active" }) : []
  if (accounts.length) await svc.updateCreditAccounts(accounts.map((a) => ({ id: a.id, status: "on_hold" as const })))
  const day = now.toISOString().slice(0, 10)
  for (const inv of overdue) {
    for (const r of await companyRecipients(scope, inv.company_id)) {
      await sendEmail(scope, {
        to: r.email,
        template: "invoice-overdue",
        locale: r.locale,
        data: { display_id: inv.display_id ?? "", currency_code: inv.currency_code, total: Number(inv.amount), due_date: new Date(inv.due_date).toISOString().slice(0, 10) },
        key: `invoice-overdue-${inv.id}-${r.email}-${day}`,
      })
    }
  }
  return { flagged: late.length, overdue: overdue.length }
}
