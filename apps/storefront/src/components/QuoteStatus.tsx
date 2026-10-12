import { useTranslations } from "next-intl"
import { Badge } from "@icommerce/ui"
import type { QuoteStatus } from "@/lib/p3/types"

// Status is text + badge; warning (clock) = waiting on the buyer's side.
const VARIANT = {
  requested: "neutral", vendor_review: "neutral", negotiating: "neutral",
  offered: "warning", pending_approval: "warning",
  accepted: "success", ordered: "success",
  rejected: "danger", expired: "danger",
} as const

export function QuoteBadge({ status }: { status: QuoteStatus }) {
  const t = useTranslations("b2b")
  return <Badge variant={VARIANT[status]}>{t(`status.${status}`)}</Badge>
}
