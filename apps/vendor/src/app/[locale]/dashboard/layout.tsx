import type { ReactNode } from "react"
import { Sidebar } from "@/components/Sidebar"
import { PlanBanner } from "@/components/PlanBanner"
import { StatusBanner } from "@/components/StatusBanner"
import { getMe } from "@/lib/api"
import { unreadChats } from "@/lib/chat"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [{ vendor, plan }, unread] = await Promise.all([getMe(), unreadChats()])
  return (
    <div className="min-h-dvh bg-ground md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar store={vendor.name} unread={unread} />
      <main className="px-4 py-6 md:px-8 md:py-8">
        <StatusBanner vendor={vendor} />
        <PlanBanner plan={plan} />
        {children}
      </main>
    </div>
  )
}
