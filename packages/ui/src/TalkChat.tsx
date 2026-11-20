"use client"

import { useEffect, useRef, useState } from "react"

export type ChatSession = { app_id: string; user_id: string; token: string; conversation_id?: string }

export type TalkChatProps = {
  /** Server action: session (+ conversation to select). null = failed. */
  load: () => Promise<ChatSession | null>
  /** Server action: fresh token when the 1 h one expires. */
  refresh: () => Promise<string | null>
  labels: { loading: string; error: string; retry: string }
  className?: string
}

/**
 * TalkJS Inbox (P5b). The SDK is imported here only, on chat pages. Conversation selection comes from the server
 * (it creates every conversation); the UI language + RTL follow the user's TalkJS `locale`, set by the backend.
 */
export function TalkChat({ load, refresh, labels, className = "" }: TalkChatProps) {
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let session: { destroy(): void } | null = null
    let dead = false
    ;(async () => {
      const s = await load()
      if (!s) throw new Error("no session")
      const { default: Talk } = await import("talkjs")
      await Talk.ready
      if (dead) return
      const talk = new Talk.Session({
        appId: s.app_id,
        userId: s.user_id,
        token: s.token,
        tokenFetcher: async () => (await refresh()) ?? "",
      })
      session = talk
      const inbox = talk.createInbox({ showFeedHeader: false })
      if (s.conversation_id) inbox.select(s.conversation_id)
      await inbox.mount(box.current)
      if (!dead) setState("ready")
    })().catch(() => !dead && setState("error"))
    return () => {
      dead = true
      session?.destroy()
    }
  }, [load, refresh, attempt])

  return (
    <div className={`relative h-[min(680px,calc(100dvh-160px))] min-h-[420px] overflow-hidden rounded-lg border border-line bg-surface ${className}`}>
      <div ref={box} className="h-full" aria-busy={state === "loading"} />
      {state !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center text-[14px]">
          {state === "loading" ? (
            <p role="status" className="m-0 text-ink-muted">{labels.loading}</p>
          ) : (
            <>
              <p role="alert" className="m-0 text-danger">{labels.error}</p>
              <button type="button" className="ic-btn ic-btn--sm" onClick={() => { setState("loading"); setAttempt((n) => n + 1) }}>
                {labels.retry}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
