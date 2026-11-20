import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { chatRoute, talk } from "../../../../../../lib/chat"
import { parse } from "../../../../../../lib/parse"

type Msg = { id: string; senderId: string | null; text?: string | null; type: string; createdAt: number }
const Q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), startingAfter: z.string().optional() })

// Read-only transcript (oldest → newest within the page).
export const GET = chatRoute(async (req: AuthenticatedMedusaRequest) => {
  const { limit, startingAfter } = parse(Q, req.query)
  const qs = new URLSearchParams({ limit: String(limit), ...(startingAfter && { startingAfter }) })
  const { data = [] } = await talk<{ data?: Msg[] }>(`/conversations/${encodeURIComponent(req.params.id)}/messages?${qs}`)
  return {
    messages: data
      .map((m) => ({ id: m.id, sender_id: m.senderId, type: m.type, text: m.text ?? null, created_at: new Date(m.createdAt).toISOString() }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }
})
