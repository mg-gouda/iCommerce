import { LoginForm } from "@/components/AuthForms"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  return <LoginForm expired={!!(await searchParams).expired} />
}
