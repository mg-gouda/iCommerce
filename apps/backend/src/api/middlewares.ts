import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"
import multer from "multer"
import { PostVendorApply, PostVendorMe, PostVendorProduct } from "./vendors/validators"
import { PostAdminVendorNote } from "./admin/vendors/validators"

// Medusa only applies CORS to /store, /admin, /auth; /vendors is ours.
const vendorCors = cors({ origin: parseCorsOrigins(process.env.VENDOR_CORS ?? ""), credentials: true })
const corsMw = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => vendorCors(req, res, next)

const MB = 1024 * 1024
const upload = (maxMb: number, mime: RegExp) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * MB, files: 10 },
    fileFilter: (_req, file, cb) => cb(null, mime.test(file.mimetype)),
  })
const kycUpload = upload(10, /^(application\/pdf|image\/(png|jpeg|webp))$/)
const imageUpload = upload(5, /^image\/(png|jpeg|webp|gif)$/)
const csvUpload = upload(5, /^(text\/csv|text\/plain|application\/vnd\.ms-excel|application\/octet-stream)$/)

const vendorAuth = authenticate("vendor", ["session", "bearer"])

export default defineMiddlewares({
  routes: [
    { matcher: "/vendors", middlewares: [corsMw] },
    {
      // Apply: caller has a registration token but no vendor actor yet.
      matcher: "/vendors",
      method: ["POST"],
      middlewares: [
        authenticate("vendor", ["session", "bearer"], { allowUnregistered: true }),
        validateAndTransformBody(PostVendorApply),
      ],
    },
    // Everything below /vendors/ needs a registered vendor actor. Handlers scope by auth_context.actor_id.
    { matcher: "/vendors/*", middlewares: [corsMw, vendorAuth] },
    { matcher: "/vendors/me", method: ["POST"], middlewares: [validateAndTransformBody(PostVendorMe)] },
    { matcher: "/vendors/me/kyc", method: ["POST"], middlewares: [kycUpload.array("files", 10)] },
    { matcher: "/vendors/uploads", method: ["POST"], middlewares: [imageUpload.array("files", 10)] },
    { matcher: "/vendors/products", method: ["POST"], middlewares: [validateAndTransformBody(PostVendorProduct)] },
    { matcher: "/vendors/products/import", method: ["POST"], middlewares: [csvUpload.single("file")] },
    // /vendors/products/:id validates + checks ownership inside the handler (a `:id` matcher would also hit /import).
    ...["approve", "reject", "suspend"].map((action) => ({
      matcher: `/admin/vendors/:id/${action}`,
      method: ["POST" as const],
      middlewares: [validateAndTransformBody(PostAdminVendorNote)],
    })),
  ],
})
