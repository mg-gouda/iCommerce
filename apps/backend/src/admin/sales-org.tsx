import { Button, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { act, api, selectCls, useGet } from "./lib"

export type Branch = { id: string; code: string; name: string }
export type Rep = { id: string; type: "branch_manager" | "account_manager" | "broker"; code: string; name: string; branch_id: string | null; manager_id: string | null; active: boolean }
export type Assignment = { id: string; target_type: string; target_id: string; branch_id: string | null; branch_manager_id: string | null; account_manager_id: string | null; broker_id: string | null }
export const KEYS = [["branch_id", "Branch"], ["branch_manager_id", "Branch manager"], ["account_manager_id", "Account manager"], ["broker_id", "Broker"]] as const
const TYPE_OF = { branch_manager_id: "branch_manager", account_manager_id: "account_manager", broker_id: "broker" } as const

/** Branches + reps for pickers and labels. */
export function useOrg() {
  const b = useGet<{ branches: Branch[] }>("/admin/sales-org/branches?limit=500")
  const r = useGet<{ reps: Rep[] }>("/admin/sales-org/reps?limit=500")
  const name = (id: string | null) => (id ? (b.data?.branches.find((x) => x.id === id) ?? r.data?.reps.find((x) => x.id === id))?.name ?? id : "—")
  return { branches: b.data?.branches ?? [], reps: r.data?.reps ?? [], name, reload: () => (b.reload(), r.reload()) }
}

/** Assignment of one company / customer / vendor. Empty fields are derived from the tree on save. */
export function AssignmentEditor({ target_type, target_id }: { target_type: string; target_id: string }) {
  const org = useOrg()
  const { data, reload } = useGet<{ assignments: Assignment[] }>(`/admin/sales-org/assignments?target_type=${target_type}&target_id=${target_id}`)
  const cur = data?.assignments[0]
  const [form, setForm] = useState<Record<string, string>>({})
  useEffect(() => setForm(Object.fromEntries(KEYS.map(([k]) => [k, (cur?.[k] as string | null) ?? ""]))), [cur])
  const save = () => api("/admin/sales-org/assignments", { target_type, target_id, ...Object.fromEntries(KEYS.map(([k]) => [k, form[k] || null])) }, "PUT")
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Text size="small">Sales org</Text>
      {KEYS.map(([k, label]) => (
        <select key={k} aria-label={label} className={selectCls} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
          <option value="">{label}: auto / none</option>
          {k === "branch_id"
            ? org.branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)
            : org.reps.filter((r) => r.type === TYPE_OF[k]).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}{r.active ? "" : " (inactive)"}</option>)}
        </select>
      ))}
      <Button size="small" variant="secondary" onClick={act(save, reload)}>Save assignment</Button>
      {cur && <Button size="small" variant="transparent" onClick={act(() => api(`/admin/sales-org/assignments/${cur.id}`, undefined, "DELETE"), reload)}>Clear</Button>}
      <Text size="xsmall" className="text-ui-fg-subtle w-full">Applies to new orders only; placed orders keep their attribution.</Text>
    </div>
  )
}
