import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";
export const metadata = { title: "Login" };
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
