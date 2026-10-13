import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { Fragment, useState } from "react"
import { act, api, selectCls, useGet } from "../../lib"

type Member = { id: string; email: string; role: string }
type KycFile = { id: string; filename: string }
type Company = {
  id: string; name: string; country: string; city: string | null; tax_id: string | null; commercial_reg_no: string | null; export_card_no: string | null
  kyc_status: string; kyc_note: string | null; kyc_files: KycFile[] | null; payment_mode: string; members: Member[]
}
type Credit = { limit_usd: number; terms_days: number; status: string } | null
const tone = { verified: "green", submitted: "orange", rejected: "red", none: "grey" } as const

function Detail({ c, reload }: { c: Company; reload: () => void }) {
  const { data, reload: reloadOne } = useGet<{ company: Company & { credit_account: Credit } }>(`/admin/companies/${c.id}`)
  const credit = data?.company.credit_account
  const [note, setNote] = useState("")
  const [limit, setLimit] = useState("")
  const [terms, setTerms] = useState("30")
  const both = () => (reload(), reloadOne())
  const post = (path: string, body: unknown) => act(() => api(`/admin/companies/${c.id}${path}`, body), both)
  return (
    <div className="flex flex-col gap-3 p-4 bg-ui-bg-subtle">
      <Text size="small">Tax ID {c.tax_id ?? "—"} · CR {c.commercial_reg_no ?? "—"} · Export card {c.export_card_no ?? "—"}</Text>
      <Text size="small">
        KYC files:{" "}
        {(c.kyc_files ?? []).map((f) => (
          <a key={f.id} className="text-ui-fg-interactive underline me-2" href={`/admin/companies/${c.id}/kyc-files/${encodeURIComponent(f.id)}`}>{f.filename}</a>
        ))}
        {!c.kyc_files?.length && "none"}
      </Text>
      <Text size="small">Members: {c.members.map((m) => `${m.email} (${m.role})`).join(", ")}</Text>
      {c.kyc_note && <Text size="small">Note: {c.kyc_note}</Text>}
      <div className="flex gap-2 items-center flex-wrap">
        <Input size="small" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} className="w-72" />
        <Button size="small" onClick={post("/verify", { note: note || undefined })}>Verify</Button>
        <Button size="small" variant="danger" onClick={post("/reject", { note })}>Reject / suspend</Button>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Text size="small">Payment mode</Text>
        <select className={selectCls} value={c.payment_mode} onChange={(e) => post("", { payment_mode: e.target.value })()}>
          <option value="upfront">upfront</option>
          <option value="net_terms">net terms</option>
        </select>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Text size="small">
          Credit: {credit ? `USD ${credit.limit_usd} · net ${credit.terms_days} · ${credit.status}` : "none"}
        </Text>
        <Input size="small" type="number" min={0} placeholder="Limit USD" value={limit} onChange={(e) => setLimit(e.target.value)} className="w-32" />
        <select className={selectCls} value={terms} onChange={(e) => setTerms(e.target.value)}>
          {["15", "30", "60"].map((d) => <option key={d} value={d}>net {d}</option>)}
        </select>
        <Button size="small" variant="secondary" onClick={post("/credit-account", { limit_usd: Number(limit || credit?.limit_usd || 0), terms_days: Number(terms), status: "active" })}>
          Save credit (active)
        </Button>
        {credit && (
          <Button size="small" variant="secondary" onClick={post("/credit-account", { limit_usd: credit.limit_usd, terms_days: credit.terms_days, status: credit.status === "active" ? "on_hold" : "active" })}>
            {credit.status === "active" ? "Put on hold" : "Reactivate"}
          </Button>
        )}
      </div>
    </div>
  )
}

const CompaniesPage = () => {
  const [kyc, setKyc] = useState("submitted")
  const { data, error, reload } = useGet<{ companies: Company[]; count: number }>(`/admin/companies?limit=100${kyc ? `&kyc_status=${kyc}` : ""}`)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Container className="p-0 divide-y">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading>Companies</Heading>
        <select aria-label="KYC status" className={selectCls} value={kyc} onChange={(e) => setKyc(e.target.value)}>
          <option value="">All</option>
          {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <Text className="px-6 py-4 text-ui-fg-error">{error}</Text>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
            <Table.HeaderCell>Country</Table.HeaderCell>
            <Table.HeaderCell>KYC</Table.HeaderCell>
            <Table.HeaderCell>Payment</Table.HeaderCell>
            <Table.HeaderCell>Members</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data?.companies.map((c) => (
            <Fragment key={c.id}>
              <Table.Row className="cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <Table.Cell>{c.name}</Table.Cell>
                <Table.Cell>{c.city ? `${c.city}, ` : ""}{c.country}</Table.Cell>
                <Table.Cell><Badge size="2xsmall" color={tone[c.kyc_status as keyof typeof tone]}>{c.kyc_status}</Badge></Table.Cell>
                <Table.Cell>{c.payment_mode}</Table.Cell>
                <Table.Cell>{c.members.length}</Table.Cell>
              </Table.Row>
              {open === c.id && (
                <tr><td colSpan={5}><Detail c={c} reload={reload} /></td></tr>
              )}
            </Fragment>
          ))}
        </Table.Body>
      </Table>
      {data && !data.count && <Text className="px-6 py-4 text-ui-fg-subtle">No companies.</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Companies" })
export default CompaniesPage
