import type { BadgeProps } from "@icommerce/ui"
import type { OrderStatus, ProductStatus, QuoteStatus, Vendor } from "./types"

type V = NonNullable<BadgeProps["variant"]>

export const kycBadge = (s: Vendor["kyc_status"]): [V, string] =>
  ({ none: ["neutral", "none"], submitted: ["warning", "submitted"], verified: ["success", "verified"], rejected: ["danger", "rejected"] })[s] as [V, string]

/** `proposed` reads as "Awaiting approval": that's what it means for the vendor. */
export const productBadge = (s: ProductStatus): V =>
  ({ draft: "neutral", proposed: "warning", published: "success", rejected: "danger" })[s] as V

/** Pending = action needed (to ship). Status always has a text label next to the color. */
export const orderBadge = (s: OrderStatus): V =>
  ({ pending: "warning", shipped: "neutral", delivered: "success", canceled: "danger" })[s] as V

/** pp_cod_cod → "cod", pp_bank-transfer_bank-transfer → "bank", pp_net-terms_net-terms → "net" (keys under orders.method). */
export const payMethod = (provider?: string | null) =>
  provider?.includes("bank") ? "bank" : provider?.includes("cod") ? "cod" : provider?.includes("net-terms") ? "net" : "other"

/** Open = waiting on the vendor (warning); offered/approval = with the buyer; ordered = won. */
export const quoteBadge = (s: QuoteStatus): V =>
  ({
    requested: "warning", vendor_review: "warning", negotiating: "warning", offered: "neutral", pending_approval: "neutral",
    accepted: "success", ordered: "success", rejected: "danger", expired: "danger",
  })[s] as V

/** Same short ref the backend puts in emails. */
export const quoteRef = (id: string) => `Q-${id.slice(-6).toUpperCase()}`
