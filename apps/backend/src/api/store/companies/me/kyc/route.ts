import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { callerMembership, companySvc, requireRole, syncCompanyGroups } from "../../../../../lib/company"
import { parse } from "../../../../../lib/parse"

const KycBody = z.object({
  tax_id: z.string().trim().min(1),
  commercial_reg_no: z.string().trim().min(1),
  export_card_no: z.string().trim().nullish().transform((v) => v || null),
})

// multipart: tax_id, commercial_reg_no, export_card_no?, files[] (private). Same contract as vendor KYC.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company, member } = await callerMembership(req)
  requireRole(member, ["admin"])
  const body = parse(KycBody, req.body)
  const files = (req.files ?? []) as Express.Multer.File[]
  if (!files.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "At least one KYC file is required.")
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((f) => ({ filename: f.originalname, mimeType: f.mimetype, content: f.buffer.toString("base64"), access: "private" as const })),
    },
  })
  const kyc_files = result.map((f, i) => ({ id: f.id, filename: files[i].originalname, mime_type: files[i].mimetype }))
  // Resubmission = re-review: status back to submitted (drops b2b_verified until the admin verifies again).
  const updated = await companySvc(req.scope).updateCompanies({
    id: company.id, ...body, kyc_files: kyc_files as unknown as Record<string, unknown>, kyc_status: "submitted", kyc_note: null, verified_at: null,
  })
  await syncCompanyGroups(req.scope, company.id)
  res.json({ company: updated })
}
