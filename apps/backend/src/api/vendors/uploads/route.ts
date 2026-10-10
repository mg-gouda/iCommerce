import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"

// Public product images. multipart/form-data, field `files`. Returns URLs to put in product `images`/`thumbnail`.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const files = (req.files ?? []) as Express.Multer.File[]
  if (!files.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "No files were uploaded")
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((f) => ({
        filename: f.originalname,
        mimeType: f.mimetype,
        content: f.buffer.toString("base64"),
        access: "public" as const,
      })),
    },
  })
  res.json({ files: result.map((f) => ({ id: f.id, url: f.url })) })
}
