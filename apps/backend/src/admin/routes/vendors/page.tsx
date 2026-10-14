import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { Fragment, useState } from "react"
import { act, api, selectCls, useGet } from "../../lib"

type VendorUser = { id: string; email: string; first_name: string | null; last_name: string | null; role: string }
type KycFile = { id: string; filename: string }
type Vendor = {
  id: string; name: string; handle: string; status: string; logo: string | null; description: string | null
  phone: string | null; email: string | null; country: string | null; city: string | null
  tax_id: string | null; commercial_reg_no: string | null; export_card_no: string | null
  kyc_status: string; kyc_note: string | null; kyc_files: KycFile[] | null; users: VendorUser[]
}
const statusTone = { approved: "green", pending: "orange", suspended: "red" } as const
const kycTone = { verified: "green", submitted: "orange", rejected: "red", none: "grey" } as const

function Detail({ v, reload }: { v: Vendor; reload: () => void }) {
  const { data, reload: reloadOne } = useGet<{ vendor: Vendor }>(`/admin/vendors/${v.id}`)
  const d = data?.vendor ?? v
  const [note, setNote] = useState("")
  const both = () => (reload(), reloadOne())
  const run = (action: string) => act(() => api(`/admin/vendors/${v.id}/${action}`, { note: note || undefined }), both)
  return (
    <div className="flex flex-col gap-3 p-4 bg-ui-bg-subtle">
      {d.description && <Text size="small">{d.description}</Text>}
      <Text size="small">
        {d.email ?? "no email"} · {d.phone ?? "no phone"} · {d.city ? `${d.city}, ` : ""}{d.country ?? "—"}
      </Text>
      <Text size="small">Tax ID {d.tax_id ?? "—"} · CR {d.commercial_reg_no ?? "—"} · Export card {d.export_card_no ?? "—"}</Text>
      <Text size="small">
        KYC files:{" "}
        {(d.kyc_files ?? []).map((f) => (
          <a key={f.id} className="text-ui-fg-interactive underline me-2" href={`/admin/vendors/${v.id}/kyc-files/${encodeURIComponent(f.id)}`}>{f.filename}</a>
        ))}
        {!d.kyc_files?.length && "none"}
      </Text>
      <Text size="small">Owners: {d.users.length ? d.users.map((u) => `${u.email} (${u.role})`).join(", ") : "none"}</Text>
      {d.kyc_note && <Text size="small">Note: {d.kyc_note}</Text>}
      <div className="flex gap-2 items-center flex-wrap">
        <Input size="small" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} className="w-72" />
        <Button size="small" onClick={run("approve")}>Approve</Button>
        <Button size="small" variant="secondary" onClick={run("reject")}>Reject</Button>
        <Button size="small" variant="danger" onClick={run("suspend")}>Suspend</Button>
      </div>
    </div>
  )
}

const VendorsPage = () => {
  const [status, setStatus] = useState("pending")
  const { data, error, reload } = useGet<{ vendors: Vendor[]; count: number }>(`/admin/vendors?limit=100${status ? `&status=${status}` : ""}`)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Container className="p-0 divide-y">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading>Vendors</Heading>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.keys(statusTone).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Vendor</Table.HeaderCell>
            <Table.HeaderCell>Country</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>KYC</Table.HeaderCell>
            <Table.HeaderCell>Owners</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.vendors.map((v) => (
            <Fragment key={v.id}>
              <Table.Row className="cursor-pointer" onClick={() => setOpen(open === v.id ? null : v.id)}>
                <Table.Cell>{v.name}<Text size="xsmall" className="text-ui-fg-subtle">Tax {v.tax_id ?? "—"} · CR {v.commercial_reg_no ?? "—"}</Text></Table.Cell>
                <Table.Cell>{v.city ? `${v.city}, ` : ""}{v.country ?? "—"}</Table.Cell>
                <Table.Cell><Badge size="2xsmall" color={statusTone[v.status as keyof typeof statusTone]}>{v.status}</Badge></Table.Cell>
                <Table.Cell><Badge size="2xsmall" color={kycTone[v.kyc_status as keyof typeof kycTone]}>{v.kyc_status}</Badge></Table.Cell>
                <Table.Cell>{v.users.length}</Table.Cell>
              </Table.Row>
              {open === v.id && (
                <tr><td colSpan={5}><Detail v={v} reload={reload} /></td></tr>
              )}
            </Fragment>
          ))}
        </Table.Body>
      </Table>
      {data && !data.count && <Text className="px-6 py-4 text-ui-fg-subtle">No vendors.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Vendors" })
export default VendorsPage
