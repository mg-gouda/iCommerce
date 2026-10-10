import { useTranslations } from "next-intl"
import { sections, type SectionId } from "@/lib/sections"

/** Page title + empty state that says what will appear here and when. */
export function EmptySection({ id }: { id: SectionId }) {
  const t = useTranslations(`sections.${id}`)
  const Icon = sections.find(([s]) => s === id)![1]
  return (
    <>
      <h1 className="m-0 text-[30px] leading-[36px] font-semibold tracking-[-0.01em]">{t("title")}</h1>
      <section className="mt-6 flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6 md:p-8">
        <Icon size={24} className="text-ink-muted" aria-hidden />
        <h2 className="m-0 text-[16px] leading-[22px] font-semibold">{t("emptyTitle")}</h2>
        <p className="m-0 max-w-[60ch] text-ink-muted">{t("emptyBody")}</p>
      </section>
    </>
  )
}
