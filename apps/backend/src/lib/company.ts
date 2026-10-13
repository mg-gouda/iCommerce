import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { COMPANY_MODULE } from "../modules/company"
import type CompanyModuleService from "../modules/company/service"

export type Role = "admin" | "buyer" | "approver"
export const B2B_GROUP = "b2b_verified"
/** Customer group of one company's contract price list. */
export const contractGroupName = (company_id: string) => `contract_${company_id}`

export const companySvc = (scope: MedusaContainer): CompanyModuleService => scope.resolve(COMPANY_MODULE)

export const MEMBER_FIELDS = ["id", "customer_id", "email", "first_name", "last_name", "role", "created_at"] as const
export const shapeMember = (m: Record<string, unknown>) => Object.fromEntries(MEMBER_FIELDS.map((k) => [k, m[k] ?? null]))
// Token never leaves the server except in the invitation email.
export const shapeInvitation = (i: { id: string; email: string; role: string; expires_at: Date; accepted_at: Date | null; created_at: Date }) => ({
  id: i.id, email: i.email, role: i.role, expires_at: i.expires_at, accepted_at: i.accepted_at, created_at: i.created_at,
})

/** Caller's membership + company; 404 when the customer has no company. */
export async function getMembership(scope: MedusaContainer, customer_id: string) {
  const [member] = await companySvc(scope).listCompanyMembers({ customer_id }, { relations: ["company"] })
  if (!member) throw new MedusaError(MedusaError.Types.NOT_FOUND, "You are not a member of a company.")
  const { company, ...rest } = member
  return { member: rest, company }
}
export const callerMembership = (req: AuthenticatedMedusaRequest) => getMembership(req.scope, req.auth_context.actor_id)

export function requireRole(member: { role?: unknown }, roles: Role[]) {
  if (!roles.includes(member.role as Role)) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, `Only company ${roles.join(" or ")}s can do this.`)
  }
}

export async function ensureGroup(scope: MedusaContainer, name: string) {
  const svc = scope.resolve(Modules.CUSTOMER)
  const [g] = await svc.listCustomerGroups({ name })
  return g ?? (await svc.createCustomerGroups({ name }))
}

/**
 * Puts the company's members into the groups they should be in and takes `removed` customers out:
 * `b2b_verified` while the company is verified, plus its contract group when one exists (contract price list).
 */
export async function syncCompanyGroups(scope: MedusaContainer, company_id: string, removed: string[] = []) {
  const company = await companySvc(scope).retrieveCompany(company_id, { relations: ["members"] })
  const customers = scope.resolve(Modules.CUSTOMER)
  const ids = company.members.map((m) => m.customer_id)
  const b2b = await ensureGroup(scope, B2B_GROUP)
  const [contract] = await customers.listCustomerGroups({ name: contractGroupName(company_id) })
  const verified = company.kyc_status === "verified"
  for (const g of [b2b, contract].filter(Boolean)) {
    const want = verified ? ids : []
    const all = [...ids, ...removed]
    if (!all.length) continue
    const have = (await customers.listCustomerGroupCustomers({ customer_group_id: g.id, customer_id: all })).map((r) => r.customer_id)
    const add = want.filter((c) => !have.includes(c))
    const drop = have.filter((c) => !want.includes(c))
    if (add.length) await customers.addCustomerToGroup(add.map((customer_id) => ({ customer_id, customer_group_id: g.id })))
    if (drop.length) await customers.removeCustomerFromGroup(drop.map((customer_id) => ({ customer_id, customer_group_id: g.id })))
  }
}

/** True when the customer is in the b2b_verified group. */
export async function isB2bVerified(scope: MedusaContainer, customer_id?: string | null) {
  if (!customer_id) return false
  const customers = scope.resolve(Modules.CUSTOMER)
  const [g] = await customers.listCustomerGroups({ name: B2B_GROUP })
  if (!g) return false
  return (await customers.listCustomerGroupCustomers({ customer_group_id: g.id, customer_id })).length > 0
}

/** Company admins (+ optional extra roles) → email + customer locale. */
export async function companyRecipients(scope: MedusaContainer, company_id: string, roles: Role[] = ["admin"]) {
  const members = await companySvc(scope).listCompanyMembers({ company_id, role: roles } as never)
  if (!members.length) return []
  const customers = await scope.resolve(Modules.CUSTOMER).listCustomers({ id: members.map((m) => m.customer_id) }, { select: ["id", "metadata"] })
  const locale = new Map(customers.map((c) => [c.id, c.metadata?.locale]))
  return members.map((m) => ({ email: m.email, locale: locale.get(m.customer_id), member_id: m.id }))
}

export async function customerLocale(scope: MedusaContainer, customer_id: string) {
  const [c] = await scope.resolve(Modules.CUSTOMER).listCustomers({ id: customer_id }, { select: ["id", "metadata"] })
  return c?.metadata?.locale
}

export const wholesaleChannelId = async (scope: MedusaContainer) =>
  (await scope.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "Wholesale" }, { select: ["id"] }))[0]?.id
