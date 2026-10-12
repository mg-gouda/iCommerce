import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { OrderView } from "@/components/OrderView"
import { Link } from "@/i18n/navigation"
import { getOrder } from "@/lib/checkout"
import { orNull } from "@/lib/session"

type Props = { params: Promise<{ id: string }> }

export default async function AccountOrderPage({ params }: Props) {
  const order = await orNull(getOrder((await params).id))
  if (!order) notFound()
  const [t, locale] = await Promise.all([getTranslations("account"), getLocale()])
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">
          {t("orderN", { n: order.display_id ?? "" })}
          <span className="ms-2 text-[14px] font-normal text-ink-muted">
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(order.created_at))}
          </span>
        </h2>
        <Link href="/account" className="text-[14px] text-brand-ink underline underline-offset-2">{t("allOrders")}</Link>
      </div>
      <OrderView order={order} signedIn />
    </section>
  )
}
