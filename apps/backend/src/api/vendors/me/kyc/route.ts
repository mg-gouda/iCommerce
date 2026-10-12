import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import type VendorModuleService from "../../../../modules/vendor/service"
import { getCaller } from "../../helpers"

const KycBody = z.object({
  tax_id: z.string().trim().min(1),
  commercial_reg_no: z.string().trim().min(1),
  // Optional: not every exporter has one yet. Empty string → null.
  export_card_no: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
})

// multipart/form-data: tax_id, commercial_reg_no, optional export_card_no + files[] (parsed by multer in middlewares.ts).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = KycBody.safeParse(req.body)
  if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, body.error.message)
  const files = (req.files ?? []) as Express.Multer.File[]
  if (!files.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "At least one KYC file is required.")

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((f) => ({
        filename: f.originalname,
        mimeType: f.mimetype,
        content: f.buffer.toString("base64"),
        access: "private" as const,
      })),
    },
  })

  const { vendor } = await getCaller(req)
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  // ponytail: resubmission replaces the file list; old private files stay on disk (audit trail), no cleanup.
  const kyc_files = result.map((f, i) => ({ id: f.id, filename: files[i].originalname, mime_type: files[i].mimetype }))
  const updated = await svc.updateVendors({
    id: vendor.id,
    ...body.data,
    kyc_files: kyc_files as unknown as Record<string, unknown>,
    kyc_status: "submitted",
    kyc_note: null,
  })
  res.json({ vendor: updated })
}
