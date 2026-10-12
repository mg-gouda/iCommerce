import { getLocale, getTranslations } from "next-intl/server"
import { InviteForm, RemoveForm, RoleForm } from "@/components/CompanyForms"
import { Link, redirect } from "@/i18n/navigation"
import { getMembers, getMembership } from "@/lib/p3/api"

export default async function MembersPage() {
  const [t, locale, m] = await Promise.all([getTranslations("b2b"), getLocale(), getMembership()])
  if (!m) redirect({ href: "/account/company", locale })
  const { members, invitations } = await getMembers()
  const admin = m!.member.role === "admin"
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })
  const name = (x: { first_name: string | null; last_name: string | null; email: string }) => [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[20px] leading-[26px] font-semibold">{t("membersOf", { company: m!.company.name })}</h2>
        <Link href="/account/company" className="text-[14px] text-brand-ink underline underline-offset-2">{t("backCompany")}</Link>
      </div>
      <p className="m-0 max-w-[70ch] text-[14px] text-ink-muted">{t("rolesExplained")}</p>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line bg-ground text-[12px] text-ink-muted">
              <th scope="col" className="px-4 py-2 text-start font-medium">{t("member")}</th>
              <th scope="col" className="px-4 py-2 text-start font-medium">{t("role")}</th>
              {admin && <th scope="col" className="px-4 py-2 text-end font-medium"><span className="sr-only">{t("actions")}</span></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((x) => {
              const self = x.id === m!.member.id
              return (
                <tr key={x.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium"><bdi>{name(x)}</bdi>{self && <span className="text-ink-muted"> ({t("you")})</span>}</div>
                    <bdi dir="ltr" className="text-[13px] text-ink-muted">{x.email}</bdi>
                  </td>
                  <td className="px-4 py-3">{admin ? <RoleForm id={x.id} role={x.role} label={name(x)} /> : t(`roles.${x.role}`)}</td>
                  {admin && <td className="px-4 py-3 text-end">{!self && <RemoveForm id={x.id} label={name(x)} />}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {admin && (
        <>
          {invitations.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-[16px] leading-[22px] font-semibold">{t("pendingInvites")}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
                {invitations.map((i) => (
                  <li key={i.id}>
                    <bdi dir="ltr">{i.email}</bdi> · {t(`roles.${i.role}`)} · <span className="text-ink-muted">{t("expires", { date: date.format(new Date(i.expires_at)) })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="invite" className="flex max-w-[720px] flex-col gap-3">
            <h3 id="invite" className="m-0 text-[16px] leading-[22px] font-semibold">{t("inviteTitle")}</h3>
            <div className="rounded-lg border border-line bg-surface p-4 md:p-6"><InviteForm /></div>
          </section>
        </>
      )}
    </div>
  )
}
