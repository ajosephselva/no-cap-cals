import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { logout } from "../login/actions";
import { ActivationPoller } from "./activation-poller";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { profile, subscription, hasAccess } = await getAccess(user.id);
  if (!profile) redirect("/onboarding");

  const { checkout } = await searchParams;
  if (!hasAccess) {
    if (checkout === "success") return <ActivationPoller />;
    redirect("/paywall");
  }

  const trialEnds = subscription?.status === "trialing" && subscription.trial_end
    ? new Date(subscription.trial_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="text-xl font-black tracking-tight">No Cap Cals</span>
        <form action={logout}>
          <button className="text-sm text-black/50 hover:text-black">Log out</button>
        </form>
      </header>
      {trialEnds && (
        <p className="mt-4 rounded-full bg-lime-300 px-4 py-1 text-center text-sm">Free trial until {trialEnds}</p>
      )}
      <section className="mt-12 text-center">
        <p className="text-sm text-black/50">Daily target</p>
        <h1 className="text-5xl font-black">{profile.daily_kcal_target}</h1>
        <p className="text-black/60">cal · {profile.protein_target_g}g protein</p>
        <p className="mt-10 text-sm text-black/40">Meal scanning lands next.</p>
      </section>
    </main>
  );
}
