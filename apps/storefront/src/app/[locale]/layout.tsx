import type { Metadata } from "next"
import type { ReactNode } from "react"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { fontVariables } from "@icommerce/ui/fonts"
import { routing } from "@/i18n/routing"
import "../globals.css"

export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }))

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta")
  return { title: t("title"), description: t("description") }
}

export default async function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={fontVariables}>
      <body className="ic-root">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
