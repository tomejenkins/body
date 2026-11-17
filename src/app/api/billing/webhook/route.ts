import { handleWebhook } from "@/features/billing/webhook";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleWebhook(request);
}
