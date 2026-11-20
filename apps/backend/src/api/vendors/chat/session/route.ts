import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { callerSession, chatRoute, Locale } from "../../../../lib/chat"
import { parse } from "../../../../lib/parse"
import { getCaller } from "../../helpers"

export const GET = chatRoute(async (req: AuthenticatedMedusaRequest) => {
  const { vendor } = await getCaller(req)
  return callerSession(req.scope, { vendor_id: vendor.id }, parse(Locale, req.query).lang)
})
