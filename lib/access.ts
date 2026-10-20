import { createClient } from "@/lib/supabase/server";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export async function getAccess(userId: string) {
  const supabase = await createClient();
  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    profile,
    subscription,
    hasAccess: Boolean(subscription && ACTIVE_STATUSES.has(subscription.status)),
  };
}
