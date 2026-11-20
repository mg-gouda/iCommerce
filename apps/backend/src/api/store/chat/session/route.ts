import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { callerSession, chatRoute, Locale } from "../../../../lib/chat"
import { parse } from "../../../../lib/parse"

export const GET = chatRoute((req: AuthenticatedMedusaRequest) =>
  callerSession(req.scope, { customer_id: req.auth_context.actor_id }, parse(Locale, req.query).lang)
)
