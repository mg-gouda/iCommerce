"use server"

import type { ChatSession } from "@icommerce/ui/chat"
import { api } from "./api"

// P5b chat (project_docs/api/p5b-chat.md). The vendor JWT stays server-side; the browser only gets a TalkJS token.

const lang = (l: string) => (l === "ar" ? "ar" : "en")

/** Session for the Messages page; with kind + ref (order | quote) the backend checks access and creates/selects it. */
export async function openChat(locale: string, kind: string | null, ref: string | null): Promise<ChatSession | null> {
  const body = (kind === "order" || kind === "quote") && ref ? { kind, ref_id: ref, lang: lang(locale) } : null
  return (body
    ? api<ChatSession>("/vendors/chat/conversations", { method: "POST", body: JSON.stringify(body) })
    : api<ChatSession>(`/vendors/chat/session?lang=${lang(locale)}`)
  ).catch(() => null)
}

export async function chatToken(locale: string) {
  return (await openChat(locale, null, null))?.token ?? null
}

/** Unread conversations for the nav badge (0 when chat is off or down). */
export async function unreadChats() {
  if (!process.env.NEXT_PUBLIC_TALKJS_APP_ID) return 0
  return (await api<{ count: number }>("/vendors/chat/unread").catch(() => null))?.count ?? 0
}
