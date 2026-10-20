"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceIdFor, PLANS, type PlanKey } from "@/lib/stripe";

export async function startCheckout(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");

  const plan = String(formData.get("plan")) as PlanKey;
  if (!(plan in PLANS)) redirect("/paywall?error=plan");

  const stripe = getStripe();
  const admin = createAdminClient();
  const origin = (await headers()).get("origin") ?? "";

  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await admin.from("subscriptions").upsert({ user_id: user.id, stripe_customer_id: customerId, status: "none" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    subscription_data: { trial_period_days: 3, metadata: { user_id: user.id } },
    success_url: `${origin}/today?checkout=success`,
    cancel_url: `${origin}/paywall`,
  });

  if (!session.url) redirect("/paywall?error=checkout");
  redirect(session.url);
}
