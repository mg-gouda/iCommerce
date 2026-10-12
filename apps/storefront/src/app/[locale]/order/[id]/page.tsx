import { CheckCircle2 } from "lucide-react"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CheckoutHeader } from "@/components/Header"
import { OrderView } from "@/components/OrderView"
import { Link } from "@/i18n/navigation"
import { getOrder } from "@/lib/checkout"
import { orNull, token } from "@/lib/session"

type Props = { params: Promise<{ id: string }> }

/** Confirmation right after placing an order (guest or signed in). */
export default async function OrderPlacedPage({ params }: Props) {
  const order = await orNull(getOrder((await params).id))
  if (!order) notFound()
  const t = await getTranslations("order")
  const signedIn = !!(await token())
  return (
    <>
      <CheckoutHeader />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pt-8 pb-12 md:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 flex items-center gap-2 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">
            <CheckCircle2 size={26} aria-hidden className="text-success" />
            {t("placed")}
          </h1>
          <p className="m-0 text-ink-muted">
            {t.rich("placedSub", { n: order.display_id ?? "", email: order.email ?? "", b: (c) => <b className="text-ink"><bdi dir="ltr">{c}</bdi></b> })}
          </p>
        </div>
        <OrderView order={order} signedIn={signedIn} />
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="ic-btn no-underline">{t("keepShopping")}</Link>
          {signedIn ? (
            <Link href="/account" className="ic-btn ic-btn--ghost no-underline">{t("myOrders")}</Link>
          ) : (
            <Link href="/register" className="ic-btn ic-btn--ghost no-underline">{t("createAccount")}</Link>
          )}
        </div>
      </main>
    </>
  )
}
