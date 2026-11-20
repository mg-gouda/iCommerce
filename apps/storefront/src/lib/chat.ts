"use server"

import type { ChatSession } from "@icommerce/ui/chat"
import { call } from "./p3/api"
import { token } from "./session"

// P5b chat (project_docs/api/p5b-chat.md). The customer JWT stays server-side; the browser only gets a TalkJS token.

const KINDS = ["product", "order", "quote"]
const lang = (l: string) => (l === "ar" ? "ar" : "en")

/** Session for the Messages page; with kind + ref the backend checks access and creates/selects that conversation. */
export async function openChat(locale: string, kind: string | null, ref: string | null): Promise<ChatSession | null> {
  const body = kind && ref && KINDS.includes(kind) ? { kind, ref_id: ref, lang: lang(locale) } : null
  return (body
    ? call<ChatSession>("/store/chat/conversations", { method: "POST", body })
    : call<ChatSession>("/store/chat/session", { query: { lang: lang(locale) } })
  ).catch(() => null)
}

export async function chatToken(locale: string) {
  return (await openChat(locale, null, null))?.token ?? null
}

/** Unread conversations for the account nav badge (0 when chat is off or down). */
export async function unreadChats() {
  if (!process.env.NEXT_PUBLIC_TALKJS_APP_ID || !(await token())) return 0
  return (await call<{ count: number }>("/store/chat/unread").catch(() => null))?.count ?? 0
}
