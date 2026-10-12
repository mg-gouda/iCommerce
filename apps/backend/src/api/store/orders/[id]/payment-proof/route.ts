import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { patchOrderMetadata } from "../../../../../lib/vendor-orders"
import { BANK_PROVIDER } from "../../../../../modules/offline-payment/service"
import { ownParentOr404 } from "../../helpers"

// multipart: `file` (parsed by multer in middlewares.ts). Private file; admin downloads it.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parent = await ownParentOr404(req)
  const file = (req as unknown as { file?: Express.Multer.File }).file
  if (!file) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A pdf/png/jpeg/webp file is required (field `file`).")
  const p = parent.payment
  if (p?.provider_id !== BANK_PROVIDER) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order is not paid by bank transfer.")
  if (p.captured_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Payment already confirmed.")

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: { files: [{ filename: file.originalname, mimeType: file.mimetype, content: file.buffer.toString("base64"), access: "private" }] },
  })
  // ponytail: re-upload replaces the pointer; the previous private file stays on disk.
  const payment_proof = { file_id: result[0].id, filename: file.originalname, mime_type: file.mimetype, uploaded_at: new Date().toISOString() }
  await patchOrderMetadata(req.scope, parent.id, { payment_proof })
  const { file_id, ...pub } = payment_proof // eslint-disable-line @typescript-eslint/no-unused-vars
  res.json({ payment_proof: pub })
}
