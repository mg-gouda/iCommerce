import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"
import multer from "multer"
import { PostVendorApply, PostVendorMe, PostVendorProduct } from "./vendors/validators"
import { PostAdminVendorNote } from "./admin/vendors/validators"
import { netTermsEligible, stripProvider } from "../lib/net-terms"
import { NET_TERMS_PROVIDER } from "../modules/offline-payment/service"
import { assertWritable, hiddenProductIds } from "../lib/plans"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"

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
const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })

// Net terms is listed only to members of verified companies with an active credit account (checkout re-checks the limit).
const hideNetTerms = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const json = res.json.bind(res)
  res.json = ((body: unknown) => {
    if (!JSON.stringify(body ?? null).includes(NET_TERMS_PROVIDER)) return json(body) // nothing to hide → no DB lookup
    const actor = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
    netTermsEligible(req.scope, actor).then(
      (ok) => {
        if (!ok) stripProvider(body, NET_TERMS_PROVIDER)
        json(body)
      },
      next,
    )
    return res
  }) as typeof res.json
  next()
}

// Public storefront may read these linked fields on /store/products (exact paths → cost_price stays private).
const STORE_PRODUCT_FIELDS = [
  ...["unit", "min_qty", "max_qty", "qty_step", "hs_code", "b2b_only", "b2c_enabled", "origin_country"].map((f) => `product_extra.${f}`),
  ...["name", "handle", "logo", "city", "country", "status", "kyc_status"].map((f) => `vendor.${f}`),
]
const allowStoreProductFields = (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  req.allowed = [...(req.allowed ?? []), ...STORE_PRODUCT_FIELDS]
  next()
}

// P4: products of vendors past due beyond the grace period are filtered out (non-destructive; back once paid).
const hideReadOnlyVendors = async (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  try {
    const hidden = await hiddenProductIds(req.scope)
    if (hidden.length) {
      const f = (req.filterableFields ?? {}) as Record<string, unknown>
      // Detail route spreads filterableFields over { id: params.id } → keep the requested id(s); empty must not mean "any".
      const raw = f.id ?? req.params?.id
      const want = raw == null ? null : ([] as string[]).concat(raw as string | string[]).filter((id) => !hidden.includes(id))
      req.filterableFields = { ...f, id: want ? (want.length ? want : ["prod_hidden"]) : { $nin: hidden } }
    }
    next()
  } catch (e) {
    next(e)
  }
}

// P4: read-only vendors (past due beyond grace) can't change products. Orders/quotes/payouts keep working.
const productsWritable = async (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  if (req.method === "GET") return next()
  try {
    const actor = (req as MedusaRequest & { auth_context: { actor_id: string } }).auth_context.actor_id
    const user = await req.scope.resolve<VendorModuleService>(VENDOR_MODULE).retrieveVendorUser(actor, { select: ["id", "vendor_id"] })
    await assertWritable(req.scope, (user as unknown as { vendor_id: string }).vendor_id)
    next()
  } catch (e) {
    next(e)
  }
}

// Runs after core's validateAndTransformQuery (which sets filterableFields) → adds a JSON filter on metadata.
const parentOrdersOnly = (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  req.filterableFields = { ...req.filterableFields, metadata: { parent_order_id: null } }
  next()
}

export default defineMiddlewares({
  routes: [
    { matcher: "/store/products*", method: ["GET"], middlewares: [allowStoreProductFields] },
    ...["/store/products", "/store/products/:id"].map((matcher) => ({ matcher, method: ["GET" as const], middlewares: [hideReadOnlyVendors] })),
    // Own-order routes (handlers 404 on anyone else's order).
    { matcher: "/store/orders/:id/vendor-orders", method: ["GET"], middlewares: [customerAuth] },
    { matcher: "/store/orders/:id/return-request", method: ["POST"], middlewares: [customerAuth] },
    { matcher: "/store/orders/:id/payment-proof", method: ["POST"], middlewares: [customerAuth, proofUpload.single("file")] },
    // Guest routes: public, matched by display_id + email, rate-limited in the handlers.
    { matcher: "/store/orders/guest-payment-proof", method: ["POST"], middlewares: [proofUpload.single("file")] },
    // Customer order list = parent orders only (vendor sub-orders share the customer).
    { matcher: "/store/orders", method: ["GET"], middlewares: [parentOrdersOnly] },
    // B2B: company + quote routes need a signed-in customer; handlers 404 non-members / other companies.
    { matcher: "/store/companies*", middlewares: [customerAuth] },
    { matcher: "/store/companies/me/kyc", method: ["POST"], middlewares: [kycUpload.array("files", 10)] },
    { matcher: "/store/quotes*", middlewares: [customerAuth] },
    ...["/store/payment-providers*", "/store/regions*", "/store/carts*"].map((matcher) => ({ matcher, middlewares: [optionalCustomer, hideNetTerms] })),
    ...["/store/products/:id/wholesale-tiers", "/store/products/wholesale-tiers"].map((matcher) => ({
      matcher,
      method: ["GET" as const],
      middlewares: [optionalCustomer],
    })),
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
    { matcher: "/vendors/products*", middlewares: [productsWritable] },
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
