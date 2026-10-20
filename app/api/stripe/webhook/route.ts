import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const toIso = (seconds?: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);

async function syncSubscription(subscriptionId: string) {
  const stripe = getStripe();
  const admin = createAdminClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let userId = sub.metadata?.user_id;
  if (!userId) {
    const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  const periodEnd = sub.items.data[0]?.current_period_end;

  const { error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    trial_end: toIso(sub.trial_end),
    current_period_end: toIso(periodEnd),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const { error: seenError } = await admin.from("stripe_events").insert({ event_id: event.id, type: event.type });
  if (seenError?.code === "23505") return new Response("Already processed", { status: 200 });
  if (seenError) return new Response("Storage error", { status: 500 });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object.id);
        break;
    }
  } catch (err) {
    await admin.from("stripe_events").delete().eq("event_id", event.id);
    console.error("Webhook handling failed", event.type, err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
