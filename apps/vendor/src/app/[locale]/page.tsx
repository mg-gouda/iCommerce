import { getLocale } from "next-intl/server"
import { redirect } from "@/i18n/navigation"

export default async function Index() {
  // ponytail: always to login until vendor_user auth exists; then route by session.
  redirect({ href: "/login", locale: await getLocale() })
}
