import { Input } from "@medusajs/ui"
import { useState } from "react"
import { selectCls, useGet } from "./lib"

type Opt = { id: string; name: string }

/** Vendor search (1.2k vendors → type to filter) + select. */
export function VendorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("")
  const { data } = useGet<{ vendors: Opt[] }>(`/admin/vendors?limit=20${q ? `&q=${encodeURIComponent(q)}` : ""}`)
  return (
    <div className="flex gap-2">
      <Input size="small" placeholder="Search vendor" value={q} onChange={(e) => setQ(e.target.value)} className="w-40" />
      <select aria-label="Vendor" className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose vendor…</option>
        {data?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        {value && !data?.vendors.some((v) => v.id === value) && <option value={value}>{value}</option>}
      </select>
    </div>
  )
}

export function CategoryPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useGet<{ product_categories: Opt[] }>("/admin/product-categories?limit=500&fields=id,name")
  return (
    <select aria-label="Category" className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose category…</option>
      {data?.product_categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

export function PlanPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useGet<{ plans: (Opt & { name_en: string })[] }>("/admin/plans")
  return (
    <select aria-label="Plan" className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose plan…</option>
      {data?.plans.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
    </select>
  )
}
