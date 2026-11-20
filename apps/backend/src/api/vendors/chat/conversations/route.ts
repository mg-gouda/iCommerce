import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { chatRoute, OpenBody, openConversation } from "../../../../lib/chat"
import { parse } from "../../../../lib/parse"
import { getCaller } from "../../helpers"

// Vendors open order + quote chats; `product` → 400 (only buyers start those).
export const POST = chatRoute(async (req: AuthenticatedMedusaRequest) => {
  const { kind, ref_id, lang } = parse(OpenBody, req.body)
  const { vendor } = await getCaller(req)
  return openConversation(req.scope, { vendor_id: vendor.id }, kind, ref_id, lang)
})
