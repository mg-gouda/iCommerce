import { MessageSquare } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"

/** P5b: opens (creates if needed) the order/quote conversation in the Messages inbox. Hidden while chat is off. */
export async function MessageBuyer({ kind, id }: { kind: "order" | "quote"; id: string }) {
  if (!process.env.NEXT_PUBLIC_TALKJS_APP_ID) return null
  const t = await getTranslations("chat")
  return (
    <Link href={`/dashboard/messages?kind=${kind}&ref=${encodeURIComponent(id)}`} className="ic-btn ic-btn--sm no-underline">
      <MessageSquare size={16} aria-hidden /> {t("messageBuyer")}
    </Link>
  )
}
