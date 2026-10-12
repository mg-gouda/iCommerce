import { cookies } from "next/headers"
import { getLocale } from "next-intl/server"
import { redirect } from "@/i18n/navigation"
import { TOKEN_COOKIE } from "@/lib/api"

export default async function Index() {
  const signedIn = (await cookies()).has(TOKEN_COOKIE)
  redirect({ href: signedIn ? "/dashboard" : "/login", locale: await getLocale() })
}
