import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { safeTimeZone, startOfToday } from "@/lib/time";
import { combineRanges } from "@/lib/ai/estimate";
import { logout } from "../login/actions";
import { deleteMeal } from "../scan/actions";
import { ActivationPoller } from "./activation-poller";
import { TimezoneSync } from "./timezone-sync";

function Ring({ fraction }: { fraction: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const shown = Math.min(fraction, 1);
  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44 -rotate-90">
      <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="14" />
      <circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke={fraction > 1 ? "#111" : "#a3e635"}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${shown * c} ${c}`}
      />
    </svg>
  );
}

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

  const tzCookie = (await cookies()).get("tz")?.value;
  const tz = safeTimeZone(tzCookie);
  const supabase = await createClient();
  const { data: meals } = await supabase
    .from("meals")
    .select("id, name, eaten_at, kcal_low, kcal_high, protein_g, carbs_g, fat_g")
    .gte("eaten_at", startOfToday(tz).toISOString())
    .order("eaten_at", { ascending: false });

  const list = meals ?? [];
  const { low, high, mid } = combineRanges(list);
  const protein = Math.round(list.reduce((s, m) => s + Number(m.protein_g), 0));
  const carbs = Math.round(list.reduce((s, m) => s + Number(m.carbs_g), 0));
  const fat = Math.round(list.reduce((s, m) => s + Number(m.fat_g), 0));
  const target = profile.daily_kcal_target;

  const trialEnds =
    subscription?.status === "trialing" && subscription.trial_end
      ? new Date(subscription.trial_end).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })
      : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">
      <TimezoneSync current={tzCookie} />
      <header className="flex items-center justify-between">
        <span className="text-xl font-black tracking-tight">No Cap Cals</span>
        <form action={logout}>
          <button className="text-sm text-black/50 hover:text-black">Log out</button>
        </form>
      </header>
      {trialEnds && <p className="mt-4 rounded-full bg-lime-300 px-4 py-1 text-center text-sm">Free trial until {trialEnds}</p>}

      <section className="mt-6 flex flex-col items-center">
        <div className="relative">
          <Ring fraction={target ? mid / target : 0} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-black tabular-nums">{mid.toLocaleString()}</span>
            <span className="text-xs text-black/50">of {target.toLocaleString()} cal</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-black/60 tabular-nums">
          {list.length ? (
            <>
              likely <span className="font-semibold text-black">{low.toLocaleString()}–{high.toLocaleString()}</span> cal today
            </>
          ) : (
            "Nothing logged yet today"
          )}
        </p>
        <div className="mt-4 w-full">
          <div className="flex justify-between text-sm">
            <span>Protein</span>
            <span className="tabular-nums text-black/60">
              {protein} / {profile.protein_target_g}g
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-black/10">
            <div className="h-2 rounded-full bg-black" style={{ width: `${Math.min(100, (protein / profile.protein_target_g) * 100)}%` }} />
          </div>
          <p className="mt-2 text-center text-xs text-black/50">
            {carbs}g carbs · {fat}g fat
          </p>
        </div>
      </section>

      <Link href="/scan" className="mt-6 rounded-xl bg-black py-4 text-center text-lg font-semibold text-lime-300">
        + Scan a meal
      </Link>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-black/40">Today&apos;s meals</h2>
        {list.length === 0 ? (
          <p className="mt-3 text-sm text-black/50">Nothing logged yet. Snap your next meal.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {list.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 hover:ring-1 hover:ring-black/10">
                <Link href={`/meals/${m.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="text-xs text-black/50">
                    {new Date(m.eaten_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })} ·{" "}
                    {Math.round(Number(m.protein_g))}g protein · tap for details
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">
                    {m.kcal_low}–{m.kcal_high}
                  </span>
                  <form action={deleteMeal}>
                    <input type="hidden" name="id" value={m.id} />
                    <button aria-label={`Delete ${m.name}`} className="text-black/30 hover:text-black">
                      ✕
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-10 text-center text-xs text-black/40">
        Estimates, not medical advice. Struggling with food?{" "}
        <a className="underline" href="https://www.allianceforeatingdisorders.com/" target="_blank" rel="noreferrer">
          Get support
        </a>
      </p>
    </main>
  );
}
