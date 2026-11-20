import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { chatRoute, unread } from "../../../../lib/chat"

// Deviation (doc §3): server-side badge for the account nav, so the SDK stays off non-chat pages.
export const GET = chatRoute((req: AuthenticatedMedusaRequest) => unread(`c_${req.auth_context.actor_id}`))
