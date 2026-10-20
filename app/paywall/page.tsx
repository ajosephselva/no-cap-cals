import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { PLANS, type PlanKey } from "@/lib/stripe";
import { startCheckout } from "./actions";

export default async function PaywallPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { profile, hasAccess } = await getAccess(user.id);
  if (!profile) redirect("/onboarding");
  if (hasAccess) redirect("/today");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-black/40">Step 2 of 2</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Your target: {profile.daily_kcal_target} cal</h1>
      <p className="mt-1 text-black/60">and {profile.protein_target_g}g protein a day.</p>

      <div className="mt-8 rounded-2xl bg-black p-6 text-white">
        <p className="text-lg font-bold text-lime-300">Try No Cap Cals free for 3 days</p>
        <ul className="mt-3 space-y-1 text-sm text-white/80">
          <li>Snap any meal, get every item and macro</li>
          <li>Honest ranges that tighten as you answer</li>
          <li>Cancel anytime before the trial ends</li>
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => (
          <form key={key} action={startCheckout}>
            <input type="hidden" name="plan" value={key} />
            <button
              className={`flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left ${
                key === "yearly" ? "border-black bg-white" : "border-black/10 bg-white/60"
              }`}
            >
              <span className="font-semibold">
                {PLANS[key].label}
                {key === "yearly" && (
                  <span className="ml-2 rounded-full bg-lime-300 px-2 py-0.5 text-xs">Best value</span>
                )}
              </span>
              <span>
                <span className="font-bold">{PLANS[key].price}</span>
                <span className="text-sm text-black/50">{PLANS[key].per}</span>
              </span>
            </button>
          </form>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">Checkout couldn&apos;t start. Try again in a moment.</p>}
      <p className="mt-6 text-center text-xs text-black/40">Test mode: use card 4242 4242 4242 4242, any future date, any CVC.</p>
    </main>
  );
}
