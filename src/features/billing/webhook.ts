import "server-only";
import Stripe from "stripe";
import { billingService, type BillingService } from "./service";
import { providerId } from "./provider";
const MAX_BYTES = 262144;
export async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    throw new Error("Body too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Body too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
const supported =
  /^(customer\.deleted|customer\.subscription\.(created|updated|deleted|paused|resumed)|invoice\.(paid|payment_failed|payment_action_required|voided|marked_uncollectible|updated)|checkout\.session\.(completed|expired|async_payment_succeeded|async_payment_failed)|charge\.(refunded|dispute\.(created|updated|closed))|refund\.(created|updated|failed))$/;
export async function handleWebhook(
  request: Request,
  serviceFactory: () => BillingService = billingService,
) {
  let service: BillingService;
  try {
    service = serviceFactory();
  } catch {
    return new Response("Billing unavailable", { status: 503 });
  }
  let event: Stripe.Event;
  try {
    event = await service.stripe.webhooks.constructEventAsync(
      await boundedBody(request),
      request.headers.get("stripe-signature") ?? "",
      service.config.secret,
      300,
      Stripe.createSubtleCryptoProvider(),
    );
    if (event.livemode !== (service.config.mode === "live") || event.account)
      throw new Error("Wrong mode or account.");
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  if (!supported.test(event.type)) return new Response(null, { status: 204 });
  try {
    const object = event.data.object;
    if (!("id" in object) || typeof object.id !== "string")
      throw new Error("Missing object identity.");
    let customer: string | undefined =
      event.type === "customer.deleted" ? object.id : undefined;
    if ("customer" in object)
      customer = providerId(object.customer as string | { id: string } | null);
    if (!customer && "charge" in object) {
      const chargeId = providerId(
        object.charge as string | { id: string } | null,
      );
      if (chargeId)
        customer = providerId(
          (await service.stripe.charges.retrieve(chargeId)).customer,
        );
    }
    if (!customer) throw new Error("Missing billing identity.");
    const owner = await service.db.lookup(customer);
    // Unmapped provider objects are not Body purchases and cannot be matched by metadata/email.
    if (!owner) return new Response(null, { status: 204 });
    await service.reconcile(owner, undefined, {
      id: event.id,
      type: event.type,
      object: object.id,
    });
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Billing reconciliation pending", { status: 503 });
  }
}
