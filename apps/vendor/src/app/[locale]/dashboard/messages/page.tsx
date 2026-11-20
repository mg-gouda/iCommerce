import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { TalkChat } from "@icommerce/ui/chat"
import { PageHeader } from "@/components/PageHeader"
import { chatToken, openChat } from "@/lib/chat"

type Props = { searchParams: Promise<{ kind?: string; ref?: string }> }

/** Shared vendor inbox (TalkJS user v_<vendor_id>). "Message buyer" lands here with ?kind=&ref= → opened + selected. */
export default async function MessagesPage({ searchParams }: Props) {
  if (!process.env.NEXT_PUBLIC_TALKJS_APP_ID) notFound()
  const [{ kind, ref }, t, ts, locale] = await Promise.all([searchParams, getTranslations("chat"), getTranslations("sections.messages"), getLocale()])
  return (
    <>
      <PageHeader title={ts("title")} sub={t("intro")} />
      <TalkChat
        load={openChat.bind(null, locale, kind ?? null, ref ?? null)}
        refresh={chatToken.bind(null, locale)}
        labels={{ loading: t("loading"), error: t("error"), retry: t("retry") }}
      />
    </>
  )
}
