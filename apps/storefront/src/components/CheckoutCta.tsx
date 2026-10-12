"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { CheckoutButton } from "@icommerce/ui"

/** Box-packing animation, then checkout (prefetched so the hand-off is instant). */
export function CheckoutCta({ label, packingLabel, doneLabel }: { label: string; packingLabel: string; doneLabel: string }) {
  const router = useRouter()
  const href = `/${useLocale()}/checkout`
  useEffect(() => {
    router.prefetch(href)
  }, [router, href])
  return <CheckoutButton label={label} packingLabel={packingLabel} doneLabel={doneLabel} onDone={() => router.push(href)} />
}
