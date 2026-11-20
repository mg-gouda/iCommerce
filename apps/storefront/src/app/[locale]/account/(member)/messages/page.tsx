import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { TalkChat } from "@icommerce/ui/chat"
import { chatToken, openChat } from "@/lib/chat"

type Props = { searchParams: Promise<{ kind?: string; ref?: string }> }

/** TalkJS inbox. "Message supplier/vendor" buttons land here with ?kind=&ref= → that conversation is opened + selected. */
export default async function MessagesPage({ searchParams }: Props) {
  if (!process.env.NEXT_PUBLIC_TALKJS_APP_ID) notFound()
  const [{ kind, ref }, t, locale] = await Promise.all([searchParams, getTranslations("chat"), getLocale()])
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("messages")}</h2>
        <p className="m-0 text-[14px] text-ink-muted">{t("intro")}</p>
      </div>
      <TalkChat
        load={openChat.bind(null, locale, kind ?? null, ref ?? null)}
        refresh={chatToken.bind(null, locale)}
        labels={{ loading: t("loading"), error: t("error"), retry: t("retry") }}
      />
    </section>
  )
}
