import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";
export const metadata = { title: "Forgot Password" };
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage mode="forgot" searchParams={searchParams} />;
}
