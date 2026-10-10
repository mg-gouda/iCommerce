import { useTranslations } from "next-intl"
import { Button, Field, LoginCard } from "@icommerce/ui"
import { Link } from "@/i18n/navigation"

async function signIn() {
  "use server"
  // ponytail: no-op until customer auth (Medusa /auth/customer/emailpass) is wired; server action keeps the password out of the URL.
}

export default function LoginPage() {
  const t = useTranslations("login")
  return (
    <LoginCard
      className="min-h-dvh"
      action={signIn}
      sub={t("sub")}
      meta={
        <>
          <Link href="/login">{t("forgot")}</Link>
          <span>
            {t("newHere")} <Link href="/login">{t("create")}</Link>
          </span>
        </>
      }
    >
      <Field label={t("email")} name="email" autoComplete="username" placeholder="you@company.com" dir="ltr" required />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" dir="ltr" required />
      <Button type="submit" variant="primary" block>
        {t("submit")}
      </Button>
    </LoginCard>
  )
}
