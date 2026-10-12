import { RegisterForm } from "@/components/AuthForms"

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <RegisterForm next={(await searchParams).next} />
}
