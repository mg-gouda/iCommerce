import type { BadgeProps } from "@icommerce/ui"
import type { ProductStatus, Vendor } from "./types"

type V = NonNullable<BadgeProps["variant"]>

export const kycBadge = (s: Vendor["kyc_status"]): [V, string] =>
  ({ none: ["neutral", "none"], submitted: ["warning", "submitted"], verified: ["success", "verified"], rejected: ["danger", "rejected"] })[s] as [V, string]

/** `proposed` reads as "Awaiting approval": that's what it means for the vendor. */
export const productBadge = (s: ProductStatus): V =>
  ({ draft: "neutral", proposed: "warning", published: "success", rejected: "danger" })[s] as V
