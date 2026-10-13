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

const proofUpload = upload(10, /^(application\/pdf|image\/(png|jpeg|webp))$/)

const vendorAuth = authenticate("vendor", ["session", "bearer"])
const customerAuth = authenticate("customer", ["session", "bearer"])

// Public storefront may read these linked fields on /store/products (exact paths → cost_price stays private).
const STORE_PRODUCT_FIELDS = [
  ...["unit", "min_qty", "max_qty", "qty_step", "hs_code", "b2b_only", "b2c_enabled", "origin_country"].map((f) => `product_extra.${f}`),
  ...["name", "handle", "logo", "city", "country", "status", "kyc_status"].map((f) => `vendor.${f}`),
]
const allowStoreProductFields = (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  req.allowed = [...(req.allowed ?? []), ...STORE_PRODUCT_FIELDS]
  next()
}

// Runs after core's validateAndTransformQuery (which sets filterableFields) → adds a JSON filter on metadata.
const parentOrdersOnly = (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  req.filterableFields = { ...req.filterableFields, metadata: { parent_order_id: null } }
  next()
}

export default defineMiddlewares({
  routes: [
    { matcher: "/store/products*", method: ["GET"], middlewares: [allowStoreProductFields] },
    // Own-order routes (handlers 404 on anyone else's order).
    { matcher: "/store/orders/:id/vendor-orders", method: ["GET"], middlewares: [customerAuth] },
    { matcher: "/store/orders/:id/return-request", method: ["POST"], middlewares: [customerAuth] },
    { matcher: "/store/orders/:id/payment-proof", method: ["POST"], middlewares: [customerAuth, proofUpload.single("file")] },
    // Guest routes: public, matched by display_id + email, rate-limited in the handlers.
    { matcher: "/store/orders/guest-payment-proof", method: ["POST"], middlewares: [proofUpload.single("file")] },
    // Customer order list = parent orders only (vendor sub-orders share the customer).
    { matcher: "/store/orders", method: ["GET"], middlewares: [parentOrdersOnly] },
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
