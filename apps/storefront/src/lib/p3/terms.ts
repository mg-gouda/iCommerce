import { getCredit, getMembership, isVerified } from "./api"

export type NetTerms = { days: number; available: number; refusal: "limit" | "overdue" | "hold" | null }

/**
 * Whether "Pay on net N days" can be offered for a total (contract §4 rules, mirrored so the buyer sees why before
 * placing the order; the backend re-checks at completion). null = no credit account → option hidden.
 */
export async function netTerms(total: number): Promise<NetTerms | null> {
  const m = await getMembership()
  if (!isVerified(m)) return null
  const { credit_account: acc, available, invoices } = await getCredit()
  if (!acc) return null
  const refusal = invoices.some((i) => i.status === "overdue") ? "overdue" : acc.status !== "active" ? "hold" : available < total ? "limit" : null
  return { days: acc.terms_days, available, refusal }
}
