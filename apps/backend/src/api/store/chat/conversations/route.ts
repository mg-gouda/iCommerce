import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { chatRoute, OpenBody, openConversation } from "../../../../lib/chat"
import { parse } from "../../../../lib/parse"

export const POST = chatRoute((req: AuthenticatedMedusaRequest) => {
  const { kind, ref_id, lang } = parse(OpenBody, req.body)
  return openConversation(req.scope, { customer_id: req.auth_context.actor_id }, kind, ref_id, lang)
})
