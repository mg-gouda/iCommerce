"use client"

import Image from "next/image"
import { useActionState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button, Field } from "@icommerce/ui"
import { saveProduct } from "@/lib/product-actions"
import type { FormState, VendorProduct } from "@/lib/types"
import { Checkbox, Select, Textarea } from "./controls"
import { FormMessage, useFieldError } from "./FormMessage"
import { panel } from "./PageHeader"
import { FileField, Saved } from "./StoreForms"

type Props = { product?: VendorProduct; categories: { id: string; name: string }[]; approved: boolean }

const fromProduct = (p?: VendorProduct): Record<string, string> => {
  const e = p?.product_extra
  const s = (x: unknown) => (x == null ? "" : String(x))
  return {
    title: s(p?.title),
    description: s(p?.description),
    category_id: s(p?.categories[0]?.id),
    price: s(p?.variants[0]?.prices.find((x) => x.currency_code === "usd")?.amount),
    compare_at: s(p?.metadata?.compare_at_usd),
    unit: s(e?.unit),
    min_qty: s(e?.min_qty),
    qty_step: s(e?.qty_step),
    max_qty: s(e?.max_qty),
    hs_code: s(e?.hs_code),
    cost_price: s(e?.cost_price),
    b2b_only: e?.b2b_only ? "on" : "",
    b2c_enabled: !e || e.b2c_enabled ? "on" : "",
    status: p?.status === "published" || p?.status === "proposed" ? "published" : "draft",
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className={`${panel} m-0 grid min-w-0 gap-4 md:grid-cols-2`}>
      <legend className="float-start mb-1 w-full text-[16px] leading-[22px] font-semibold md:col-span-2">{title}</legend>
      {children}
    </fieldset>
  )
}

export function ProductForm({ product, categories, approved }: Props) {
  const t = useTranslations("product")
  const locale = useLocale()
  const [state, action, pending] = useActionState(saveProduct.bind(null, product?.id ?? ""), {} as FormState)
  const err = useFieldError(state)
  // React resets the form after each action; defaults follow the last submitted values so nothing typed is lost.
  const v = state.values ?? fromProduct(product)
  return (
    <form action={action} noValidate className="flex max-w-[880px] flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <FormMessage state={state} />

      <Section title={t("basics")}>
        <div className="md:col-span-2">
          <Field label={t("title")} name="title" required defaultValue={v.title} error={err("title")} />
        </div>
        <div className="md:col-span-2">
          <Textarea label={t("description")} name="description" defaultValue={v.description} help={t("descriptionHelp")} />
        </div>
        <Select label={t("category")} name="category_id" defaultValue={v.category_id}>
          <option value="">{t("noCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Field label={t("hsCode")} name="hs_code" mono dir="ltr" placeholder="7615.10" defaultValue={v.hs_code} help={t("hsCodeHelp")} />
      </Section>

      <Section title={t("pricing")}>
        <Field label={t("price")} name="price" inputMode="decimal" dir="ltr" unit="USD" required defaultValue={v.price} error={err("price")} />
        <Field label={t("compareAt")} name="compare_at" inputMode="decimal" dir="ltr" unit="USD" defaultValue={v.compare_at} help={t("compareAtHelp")} error={err("compare_at")} />
        <Field label={t("costPrice")} name="cost_price" inputMode="decimal" dir="ltr" unit="USD" defaultValue={v.cost_price} help={t("costPriceHelp")} error={err("cost_price")} />
        <Field label={t("unit")} name="unit" placeholder={t("unitPlaceholder")} defaultValue={v.unit} help={t("unitHelp")} />
      </Section>

      <Section title={t("quantities")}>
        <Field label={t("minQty")} name="min_qty" type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" defaultValue={v.min_qty} help={t("minQtyHelp")} error={err("min_qty")} />
        <Field label={t("qtyStep")} name="qty_step" type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" defaultValue={v.qty_step} help={t("qtyStepHelp")} error={err("qty_step")} />
        <Field label={t("maxQty")} name="max_qty" type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" defaultValue={v.max_qty} help={t("maxQtyHelp")} error={err("max_qty")} />
      </Section>

      <Section title={t("images")}>
        {!!product?.images.length && (
          <ul className="m-0 flex list-none flex-wrap gap-3 p-0 md:col-span-2">
            {product.images.map((img, i) => (
              <li key={img.id} className="flex flex-col items-start gap-1">
                <Image src={img.url} alt={t("imageN", { n: i + 1 })} width={96} height={72} className="h-[72px] w-24 rounded-md border border-line object-cover" />
                <label className="flex items-center gap-1 text-[13px]">
                  <input type="checkbox" name="keep_image" value={img.url} defaultChecked className="size-4 accent-brand" />
                  {t("keep")}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="md:col-span-2">
          <FileField label={t("addImages")} name="images" multiple accept="image/png,image/jpeg,image/webp,image/gif" help={t("imagesHelp")} error={err("images")} />
        </div>
      </Section>

      <Section title={t("selling")}>
        <Checkbox name="b2c_enabled" label={t("retail")} help={t("retailHelp")} defaultChecked={!!v.b2c_enabled} />
        <Checkbox name="b2b_only" label={t("b2bOnly")} help={t("b2bOnlyHelp")} defaultChecked={!!v.b2b_only} />
        <div role="radiogroup" aria-labelledby="status-label" className="flex flex-col gap-2 md:col-span-2">
          <span id="status-label" className="ic-label">{t("visibility")}</span>
          {(["draft", "published"] as const).map((s) => (
            <label key={s} className="flex items-start gap-2">
              <input type="radio" name="status" value={s} defaultChecked={v.status === s} className="mt-0.5 size-4 accent-brand" />
              <span className="flex flex-col">
                <span className="font-medium">{s === "draft" ? t("draft") : approved ? t("publish") : t("submitForApproval")}</span>
                <span className="ic-help">{s === "draft" ? t("draftHelp") : approved ? t("publishHelp") : t("pendingHelp")}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" busy={pending}>{product ? t("save") : t("create")}</Button>
        <Saved show={state.ok && !pending} label={t("saved")} />
      </div>
    </form>
  )
}
