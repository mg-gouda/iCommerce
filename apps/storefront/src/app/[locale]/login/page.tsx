import { LoginForm } from "@/components/AuthForms"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <LoginForm next={(await searchParams).next} />
}
