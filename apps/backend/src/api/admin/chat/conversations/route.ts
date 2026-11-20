import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { chatRoute, talk } from "../../../../lib/chat"
import { listQuery, parse } from "../../../../lib/parse"

type Conv = { id: string; subject?: string | null; custom?: Record<string, string>; participants?: Record<string, unknown>; createdAt: number; lastMessage?: { createdAt: number } | null }
const List = z.object({ kind: z.enum(["product", "order", "quote"]).optional(), vendor_id: z.string().optional(), customer_id: z.string().optional(), ...listQuery })

// Disputes: newest first. ponytail: scans the 100 newest conversations (of the vendor/customer when given) and filters `custom` here.
export const GET = chatRoute(async (req: AuthenticatedMedusaRequest) => {
  const { kind, vendor_id, customer_id, limit, offset } = parse(List, req.query)
  const base = vendor_id ? `/users/v_${encodeURIComponent(vendor_id)}` : customer_id ? `/users/c_${encodeURIComponent(customer_id)}` : ""
  const { data = [] } = await talk<{ data?: Conv[] }>(`${base}/conversations?limit=100`)
  const want = { kind, vendor_id, customer_id }
  const hits = data
    .filter((c) => Object.entries(want).every(([k, v]) => !v || c.custom?.[k] === v))
    .map((c) => ({
      id: c.id, subject: c.subject ?? null, custom: c.custom ?? {}, participants: Object.keys(c.participants ?? {}),
      created_at: new Date(c.createdAt).toISOString(), last_message_at: c.lastMessage ? new Date(c.lastMessage.createdAt).toISOString() : null,
    }))
    .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))
  return { conversations: hits.slice(offset, offset + limit), count: hits.length, limit, offset }
})
