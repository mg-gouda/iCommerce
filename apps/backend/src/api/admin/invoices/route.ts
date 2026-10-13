import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { companySvc } from "../../../lib/company"
import { shapeInvoice } from "../../../lib/net-terms"
import { listQuery, parse } from "../../../lib/parse"

const List = z.object({ status: z.enum(["open", "paid", "overdue"]).optional(), company_id: z.string().optional(), ...listQuery })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { status, company_id, limit, offset } = parse(List, req.query)
  const svc = companySvc(req.scope)
  const [invoices, count] = await svc.listAndCountInvoices(
    { ...(status && { status }), ...(company_id && { company_id }) },
    { order: { due_date: "ASC" }, skip: offset, take: limit },
  )
  const ids = [...new Set(invoices.map((i) => i.company_id))]
  const names = new Map((ids.length ? await svc.listCompanies({ id: ids }, { select: ["id", "name"] }) : []).map((c) => [c.id, c.name]))
  res.json({
    invoices: invoices.map((i) => ({ ...shapeInvoice(i), company: { id: i.company_id, name: names.get(i.company_id) ?? null } })),
    count, limit, offset,
  })
}
