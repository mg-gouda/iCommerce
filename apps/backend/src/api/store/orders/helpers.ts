import type { AuthenticatedMedusaRequest, MedusaRequest } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { loadVendorOrders, parentPayments, patchOrderMetadata, vendorOrderLinks } from "../../../lib/vendor-orders"
import { BANK_PROVIDER } from "../../../modules/offline-payment/service"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"

type Parent = { id: string; metadata: Record<string, any> | null; payment?: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Caller's own parent order (+ payment); anyone else's — or a vendor child order — is a 404. */
export async function ownParentOr404(req: AuthenticatedMedusaRequest) {
  const parent = (await parentPayments(req.scope, [req.params.id])).get(req.params.id)
  if (!parent || parent.customer_id !== req.auth_context.actor_id || parent.metadata?.parent_order_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${req.params.id}" not found`)
  }
  return parent as typeof parent & Parent
}

/** Guest lookup: parent order by display id + email (case-insensitive). Every mismatch is the same 404 (no enumeration). */
export async function guestParentOr404(scope: MedusaContainer, display_id: unknown, email: unknown) {
  const n = Number(display_id)
  const e = String(email ?? "").trim().toLowerCase()
  const miss = new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  if (!Number.isSafeInteger(n) || n <= 0 || !e) throw miss
  const { data: [o] } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "display_id", "created_at", "currency_code", "total"],
    filters: { display_id: String(n) },
  })
  const parent = o && (await parentPayments(scope, [o.id])).get(o.id)
  if (!parent || parent.metadata?.parent_order_id || String(parent.email ?? "").toLowerCase() !== e) throw miss
  return Object.assign(parent as Parent & typeof parent, { order: { display_id: Number(o.display_id), created_at: o.created_at, currency_code: o.currency_code, total: Number(o.total) } })
}

export async function childOrders(scope: MedusaContainer, parent: { metadata: Record<string, unknown> | null }) {
  const ids = (parent.metadata?.vendor_order_ids ?? []) as string[]
  const links = ids.length ? await vendorOrderLinks(scope, { order_id: ids }) : []
  return loadVendorOrders(scope, ids, new Map(links.map((l) => [l.order_id, l.status])))
}

/** Buyer-facing per-vendor progress + payment state (no buyer PII: email, address, names). */
export async function orderStatusView(scope: MedusaContainer, parent: Parent) {
  const children = await childOrders(scope, parent)
  const vendors = children.length
    ? await scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({ id: children.map((c) => c.vendor_id) }, { select: ["id", "name", "handle"] })
    : []
  const p = parent.payment
  const captured = (p?.captures ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  return {
    vendor_orders: children.map(({ email, buyer, shipping_address, vendor_id, ...c }) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
      ...c,
      vendor: vendors.find((v) => v.id === vendor_id) ?? null,
    })),
    payment: p
      ? {
          provider_id: p.provider_id,
          status: p.canceled_at ? "canceled" : captured >= Number(p.amount) ? "captured" : captured > 0 ? "partially_captured" : "authorized",
          bank_details: p.provider_id === BANK_PROVIDER ? (process.env.BANK_TRANSFER_DETAILS ?? "") : null,
          proof_uploaded_at: parent.metadata?.payment_proof?.uploaded_at ?? null,
        }
      : null,
  }
}

/** Stores the multipart `file` (parsed by multer in middlewares.ts) privately as the order's payment proof; admin downloads it. */
export async function saveProof(req: MedusaRequest, orderId: string) {
  const file = (req as unknown as { file?: Express.Multer.File }).file
  if (!file) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A pdf/png/jpeg/webp file is required (field `file`).")
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: { files: [{ filename: file.originalname, mimeType: file.mimetype, content: file.buffer.toString("base64"), access: "private" }] },
  })
  // ponytail: re-upload replaces the pointer; the previous private file stays on disk.
  const payment_proof = { file_id: result[0].id, filename: file.originalname, mime_type: file.mimetype, uploaded_at: new Date().toISOString() }
  await patchOrderMetadata(req.scope, orderId, { payment_proof })
  const { file_id, ...pub } = payment_proof // eslint-disable-line @typescript-eslint/no-unused-vars
  return pub
}

/** Bank transfer still awaiting confirmation (proof upload allowed). */
export const awaitingTransfer = (p?: Record<string, any>) => p?.provider_id === BANK_PROVIDER && !p.captured_at // eslint-disable-line @typescript-eslint/no-explicit-any
