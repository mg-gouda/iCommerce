"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@icommerce/ui"
import { deleteProduct } from "@/lib/product-actions"

/** Inline two-step delete: no modal, focus moves to the confirm and back on cancel. */
export function DeleteProduct({ id, title }: { id: string; title: string }) {
  const t = useTranslations("products")
  // null = untouched, false = cancelled (focus returns to the trigger)
  const [confirming, setConfirming] = useState<boolean | null>(null)
  if (!confirming)
    return (
      <Button autoFocus={confirming === false} size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={t("deleteLabel", { title })}>
        {t("delete")}
      </Button>
    )
  return (
    <form action={deleteProduct} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-[13px] text-danger">{t("confirmDelete")}</span>
      <Button type="submit" size="sm" variant="danger" autoFocus aria-label={t("confirmLabel", { title })}>
        {t("confirm")}
      </Button>
      <Button type="button" size="sm" onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
    </form>
  )
}
