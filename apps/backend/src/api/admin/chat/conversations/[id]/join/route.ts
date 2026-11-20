import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { chatRoute, putOps, session, talk } from "../../../../../../lib/chat"

// Support joins a dispute: `ops` becomes a participant (gets notifications) + an ops session for the TalkJS UI.
export const POST = chatRoute(async (req: AuthenticatedMedusaRequest) => {
  await putOps()
  await talk(`/conversations/${encodeURIComponent(req.params.id)}/participants/ops`, { method: "PUT", body: { access: "ReadWrite", notify: true } })
  return session("ops")
})
