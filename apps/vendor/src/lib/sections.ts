import {
  ChartColumn, FileText, LayoutDashboard, MessageSquare, Package, Settings, ShoppingCart, Wallet, type LucideIcon,
} from "lucide-react"

/** Sidebar order. "dashboard" is the index route; the rest are /dashboard/<id>. */
export const sections = [
  ["dashboard", LayoutDashboard],
  ["products", Package],
  ["orders", ShoppingCart],
  ["quotes", FileText],
  ["messages", MessageSquare],
  ["reports", ChartColumn],
  ["payouts", Wallet],
  ["settings", Settings],
] as const satisfies readonly (readonly [string, LucideIcon])[]

export type SectionId = (typeof sections)[number][0]
export const isSection = (s: string): s is SectionId => sections.some(([id]) => id === s)
