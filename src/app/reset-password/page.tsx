import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";
export const metadata = { title: "Reset Password" };
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage mode="reset" searchParams={searchParams} />;
}
