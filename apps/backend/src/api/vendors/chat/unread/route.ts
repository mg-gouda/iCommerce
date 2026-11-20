import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { chatRoute, unread } from "../../../../lib/chat"
import { getCaller } from "../../helpers"

export const GET = chatRoute(async (req: AuthenticatedMedusaRequest) => unread(`v_${(await getCaller(req)).vendor.id}`))
