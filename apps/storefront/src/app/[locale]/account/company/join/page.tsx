import { getLocale, getTranslations } from "next-intl/server"
import { AcceptInviteForm } from "@/components/CompanyForms"
import { Header } from "@/components/Header"
import { Link, redirect } from "@/i18n/navigation"
import { getMembership } from "@/lib/p3/api"
import { getCustomer } from "@/lib/session"

type Props = { searchParams: Promise<{ token?: string }> }

/** Invitation link from email (`/account/company/join?token=…`). Outside the account layout so sign-in keeps the token. */
export default async function JoinPage({ searchParams }: Props) {
  const [locale, { token = "" }] = await Promise.all([getLocale(), searchParams])
  const customer = await getCustomer()
  // Sign in (or create an account with the invited email), then come straight back here.
  if (!customer) redirect({ href: `/login?next=${encodeURIComponent(`/account/company/join?token=${token}`)}`, locale })
  const [t, m] = await Promise.all([getTranslations("b2b"), getMembership()])
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-12 md:px-8">
        <h1 className="m-0 text-[24px] leading-[30px] font-semibold rtl:leading-[36px]">{t("joinTitle")}</h1>
        {m ? (
          <>
            <p className="m-0 text-ink-muted">{t("joinAlready", { company: m.company.name })}</p>
            <Link href="/account/company" className="ic-btn self-start no-underline">{t("company")}</Link>
          </>
        ) : token ? (
          <>
            <p className="m-0 text-ink-muted">{t("joinBody", { email: customer!.email })}</p>
            <AcceptInviteForm token={token} />
          </>
        ) : (
          <p role="alert" className="ic-error m-0">{t("joinNoToken")}</p>
        )}
      </main>
    </>
  )
}
