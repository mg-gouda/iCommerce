import { useTranslations } from "next-intl"
import { Badge } from "@icommerce/ui"
import type { Quote } from "@/lib/p3/types"

// Status is text + badge; warning (clock) = waiting on the buyer's side.
const VARIANT = {
  routing: "neutral", routed: "success", no_supplier: "danger",
  requested: "neutral", vendor_review: "neutral", negotiating: "neutral",
  offered: "warning", pending_approval: "warning",
  accepted: "success", ordered: "success",
  rejected: "danger", expired: "danger",
} as const

export function QuoteBadge({ quote }: { quote: Pick<Quote, "status" | "vendor"> }) {
  const t = useTranslations("b2b")
  // Vendor-less + rejected = iCommerce closed it: no supplier found.
  const s = !quote.vendor && quote.status === "rejected" ? "no_supplier" : quote.status
  return <Badge variant={VARIANT[s]}>{t(`status.${s}`)}</Badge>
}
