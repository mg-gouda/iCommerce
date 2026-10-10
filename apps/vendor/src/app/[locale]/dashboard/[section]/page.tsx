import { notFound } from "next/navigation"
import { EmptySection } from "@/components/EmptySection"
import { isSection, sections } from "@/lib/sections"

export const dynamicParams = false
export const generateStaticParams = () =>
  sections.filter(([id]) => id !== "dashboard").map(([section]) => ({ section }))

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!isSection(section) || section === "dashboard") notFound()
  return <EmptySection id={section} />
}
