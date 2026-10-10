import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../../../../modules/vendor"
import type VendorModuleService from "../../../../../../modules/vendor/service"

type KycFile = { id: string; filename: string; mime_type: string }

// Streams a private KYC doc to an admin. Only ids listed on this vendor are served.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const vendor = await svc.retrieveVendor(req.params.id)
  const file = ((vendor.kyc_files ?? []) as KycFile[]).find((f) => f.id === req.params.file_id)
  if (!file) throw new MedusaError(MedusaError.Types.NOT_FOUND, "KYC file not found")
  const stream = await req.scope.resolve(Modules.FILE).getDownloadStream(file.id)
  res.setHeader("Content-Type", file.mime_type)
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename.replace(/["\r\n]/g, "")}"`)
  stream.pipe(res)
}
