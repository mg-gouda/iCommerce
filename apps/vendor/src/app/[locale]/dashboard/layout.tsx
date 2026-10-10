import type { ReactNode } from "react"
import { Sidebar } from "@/components/Sidebar"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar />
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  )
}
