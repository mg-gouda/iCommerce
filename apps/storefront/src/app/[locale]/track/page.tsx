import type { Metadata } from "next"
import { cookies } from "next/headers"
import { getLocale, getTranslations } from "next-intl/server"
import { money } from "@icommerce/ui"
import { Header } from "@/components/Header"
import { TrackForm } from "@/components/OrderForms"
import { PaymentPanel, Shipments } from "@/components/OrderView"
import { Link } from "@/i18n/navigation"
import { forgetTrack } from "@/lib/account-actions"
import { orderStatusOrNull } from "@/lib/checkout"
import { TRACK_COOKIE } from "@/lib/session"

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getTranslations("track"))("title")} · iCommerce` }
}

/** Guest tracking: order number + email (remembered in an httpOnly cookie by `trackOrder`) → per-supplier status + bank receipt upload. */
export default async function TrackPage() {
  const [t, to, locale] = await Promise.all([getTranslations("track"), getTranslations("order"), getLocale()])
  let lookup: { n: string; email: string } | null = null
  try {
    lookup = JSON.parse((await cookies()).get(TRACK_COOKIE)?.value ?? "null")
  } catch {}
  const status = lookup && (await orderStatusOrNull(lookup.n, lookup.email))

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pt-8 pb-12 md:px-8">
        {status && lookup ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">
                {t("orderN", { n: status.order.display_id })}
                <bdi className="ms-2 inline-block text-[14px] font-normal text-ink-muted">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(status.order.created_at))}
                </bdi>
              </h1>
              <form action={forgetTrack}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[14px] text-brand-ink underline underline-offset-2">{t("another")}</button>
              </form>
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
                <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{to("shipments")}</h2>
                <p className="m-0 text-[14px] text-ink-muted">{to("shipNote")}</p>
                {status.vendor_orders.length ? <Shipments status={status} t={to} /> : <p className="m-0">{t("preparing")}</p>}
              </div>
              <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
                <PaymentPanel t={to} n={status.order.display_id} email={lookup.email} total={money(status.order.total, status.order.currency_code.toUpperCase())} payment={status.payment} />
              </aside>
            </div>
          </>
        ) : (
          <section className="flex w-full max-w-[480px] flex-col gap-4 self-center rounded-lg border border-line bg-surface p-6">
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("title")}</h1>
              <p className="m-0 text-[14px] text-ink-muted">{t("sub")}</p>
            </div>
            {/* Cookie left over but the lookup stopped matching (or got rate-limited): say so above a fresh form. */}
            {lookup && <p role="alert" className="ic-error m-0">{t("expired")}</p>}
            <TrackForm />
            <p className="m-0 text-[14px] text-ink-muted">
              {t("haveAccount")} <Link href="/login?next=/account" className="text-brand-ink underline underline-offset-2">{t("signIn")}</Link>
            </p>
          </section>
        )}
      </main>
    </>
  )
}
