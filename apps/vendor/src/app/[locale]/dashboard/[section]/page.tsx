import { notFound } from "next/navigation"
import { EmptySection } from "@/components/EmptySection"
import { isSection, sections } from "@/lib/sections"

// products, orders, quotes + settings have their own routes.
const own = ["dashboard", "products", "orders", "quotes", "settings"]
export const dynamicParams = false
export const generateStaticParams = () => sections.filter(([id]) => !own.includes(id)).map(([section]) => ({ section }))

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!isSection(section) || own.includes(section)) notFound()
  return <EmptySection id={section} />
}
