import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

// Streams the buyer's bank-transfer receipt (private file) to an admin.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const order = await req.scope.resolve(Modules.ORDER).retrieveOrder(req.params.id, { select: ["id", "metadata"] })
  const proof = order.metadata?.payment_proof as { file_id: string; filename: string; mime_type: string } | undefined
  if (!proof) throw new MedusaError(MedusaError.Types.NOT_FOUND, "No payment proof uploaded")
  const stream = await req.scope.resolve(Modules.FILE).getDownloadStream(proof.file_id)
  res.setHeader("Content-Type", proof.mime_type)
  res.setHeader("Content-Disposition", `attachment; filename="${proof.filename.replace(/["\r\n]/g, "")}"`)
  stream.pipe(res)
}
