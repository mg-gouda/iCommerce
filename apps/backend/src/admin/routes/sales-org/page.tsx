import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { act, api, selectCls, useGet } from "../../lib"
import { type Assignment, KEYS, type Rep, useOrg } from "../../sales-org"

const TYPES = { branch_manager: "Branch manager", account_manager: "Account manager", broker: "Broker" } as const
const del = (path: string) => api(path, undefined, "DELETE")

function Branches({ org }: { org: ReturnType<typeof useOrg> }) {
  const [f, setF] = useState({ code: "", name: "" })
  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <Heading level="h2">Branches</Heading>
      <Table>
        <Table.Header><Table.Row>{["Code", "Name", "Reps", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row></Table.Header>
        <Table.Body>
          {org.branches.map((b) => (
            <Table.Row key={b.id}>
              <Table.Cell>{b.code}</Table.Cell>
              <Table.Cell>{b.name}</Table.Cell>
              <Table.Cell>{org.reps.filter((r) => r.branch_id === b.id).length}</Table.Cell>
              <Table.Cell><Button size="small" variant="transparent" onClick={act(() => del(`/admin/sales-org/branches/${b.id}`), org.reload)}>Delete</Button></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex flex-wrap gap-2">
        <Input size="small" placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="w-28" />
        <Input size="small" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-56" />
        <Button size="small" disabled={!f.code || !f.name} onClick={act(() => api("/admin/sales-org/branches", f), () => (setF({ code: "", name: "" }), org.reload()))}>Add branch</Button>
      </div>
    </div>
  )
}

/** Tree: branch → branch manager → account managers / brokers; reps without a manager listed last. */
function Reps({ org }: { org: ReturnType<typeof useOrg> }) {
  const [f, setF] = useState({ type: "account_manager", code: "", name: "", branch_id: "", manager_id: "" })
  const managers = org.reps.filter((r) => r.type === "branch_manager")
  const under = (id: string) => org.reps.filter((r) => r.manager_id === id)
  const loose = org.reps.filter((r) => r.type !== "branch_manager" && !managers.some((m) => m.id === r.manager_id))
  const row = (r: Rep, depth: number) => (
    <Table.Row key={r.id}>
      <Table.Cell><span style={{ paddingInlineStart: depth * 24 }}>{depth ? "└ " : ""}{r.code} · {r.name}</span></Table.Cell>
      <Table.Cell>{TYPES[r.type]}</Table.Cell>
      <Table.Cell>{org.name(r.branch_id)}</Table.Cell>
      <Table.Cell><Badge size="2xsmall" color={r.active ? "green" : "grey"}>{r.active ? "active" : "inactive"}</Badge></Table.Cell>
      <Table.Cell>
        <Button size="small" variant="transparent" onClick={act(() => api(`/admin/sales-org/reps/${r.id}`, { active: !r.active }), org.reload)}>{r.active ? "Deactivate" : "Activate"}</Button>
        <Button size="small" variant="transparent" onClick={act(() => del(`/admin/sales-org/reps/${r.id}`), org.reload)}>Delete</Button>
      </Table.Cell>
    </Table.Row>
  )
  const body = { type: f.type, code: f.code, name: f.name, ...(f.branch_id && { branch_id: f.branch_id }), ...(f.manager_id && f.type !== "branch_manager" && { manager_id: f.manager_id }) }
  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <Heading level="h2">Reps</Heading>
      <Table>
        <Table.Header><Table.Row>{["Rep", "Type", "Branch", "Status", ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row></Table.Header>
        <Table.Body>
          {managers.flatMap((m) => [row(m, 0), ...under(m.id).map((r) => row(r, 1))])}
          {loose.map((r) => row(r, 0))}
        </Table.Body>
      </Table>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Type" className={selectCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input size="small" placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="w-24" />
        <Input size="small" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-48" />
        <select aria-label="Branch" className={selectCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
          <option value="">Branch (from manager)</option>
          {org.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {f.type !== "branch_manager" && (
          <select aria-label="Manager" className={selectCls} value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
            <option value="">Branch manager…</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <Button size="small" disabled={!f.code || !f.name} onClick={act(() => api("/admin/sales-org/reps", body), () => (setF({ ...f, code: "", name: "" }), org.reload()))}>Add rep</Button>
      </div>
    </div>
  )
}

function Assignments({ org }: { org: ReturnType<typeof useOrg> }) {
  const [type, setType] = useState("")
  const [offset, setOffset] = useState(0)
  const { data, reload } = useGet<{ assignments: Assignment[]; count: number }>(`/admin/sales-org/assignments?limit=50&offset=${offset}${type ? `&target_type=${type}` : ""}`)
  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex items-center justify-between">
        <Heading level="h2">Assignments</Heading>
        <select aria-label="Target type" className={selectCls} value={type} onChange={(e) => (setType(e.target.value), setOffset(0))}>
          <option value="">All targets</option>
          {["company", "customer", "vendor"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <Text size="small" className="text-ui-fg-subtle">Edit a company's assignment from Companies. Orders copy the assignment when placed (company first, then customer); vendor assignments are for reference only.</Text>
      <Table>
        <Table.Header><Table.Row>{["Target", ...KEYS.map(([, l]) => l), ""].map((h) => <Table.HeaderCell key={h}>{h}</Table.HeaderCell>)}</Table.Row></Table.Header>
        <Table.Body>
          {data?.assignments.map((a) => (
            <Table.Row key={a.id}>
              <Table.Cell>{a.target_type} · <span className="font-mono text-xs">{a.target_id}</span></Table.Cell>
              {KEYS.map(([k]) => <Table.Cell key={k}>{org.name(a[k])}</Table.Cell>)}
              <Table.Cell><Button size="small" variant="transparent" onClick={act(() => del(`/admin/sales-org/assignments/${a.id}`), reload)}>Delete</Button></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex items-center gap-2">
        <Button size="small" variant="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Button>
        <Text size="small">{data ? `${data.count ? offset + 1 : 0}–${Math.min(offset + 50, data.count)} of ${data.count}` : ""}</Text>
        <Button size="small" variant="secondary" disabled={!data || offset + 50 >= data.count} onClick={() => setOffset(offset + 50)}>Next</Button>
      </div>
    </div>
  )
}

const SalesOrgPage = () => {
  const org = useOrg()
  return (
    <Container className="p-0 divide-y">
      <div className="px-6 py-4">
        <Heading>Sales org</Heading>
        <Text size="small" className="text-ui-fg-subtle">Branches, branch managers, account managers and brokers. Referenced records can't be deleted: deactivate reps instead.</Text>
      </div>
      <Branches org={org} />
      <Reps org={org} />
      <Assignments org={org} />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Sales org" })
export default SalesOrgPage
