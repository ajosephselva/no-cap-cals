import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { safeTimeZone } from "@/lib/time";
import { EstimateHeader, Trail, CopyNumber, type Step } from "@/components/estimate-view";
import { deleteMeal } from "../../scan/actions";
import type { EstimatedItem } from "@/lib/ai/estimate";

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: meal } = await supabase.from("meals").select("*").eq("id", id).maybeSingle();
  if (!meal) notFound();

  const tz = safeTimeZone((await cookies()).get("tz")?.value);
  const items = (meal.items ?? []) as EstimatedItem[];
  const steps = (meal.steps ?? []) as Step[];
  const best = Math.round((meal.kcal_low + meal.kcal_high) / 2 / 10) * 10;
  const scaleMax = Math.ceil((Math.max(meal.kcal_high, ...steps.map((s) => s.high)) * 1.15) / 100) * 100;
  const when = new Date(meal.eaten_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/today" className="text-sm text-black/50 hover:text-black">
          ← Today
        </Link>
        <span className="text-xs text-black/40">{when}</span>
      </header>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-black/50">{meal.name}</p>
          {meal.confidence && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{meal.confidence} confidence</span>}
        </div>
        <div className="mt-1">
          <EstimateHeader low={meal.kcal_low} high={meal.kcal_high} scaleMax={scaleMax} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-black/60">
            {Math.round(Number(meal.protein_g))}g protein · {Math.round(Number(meal.carbs_g))}g carbs · {Math.round(Number(meal.fat_g))}g fat
          </p>
          <CopyNumber value={best} />
        </div>
      </div>

      <Trail steps={steps} scaleMax={scaleMax} />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Items</p>
        {items.map((it, i) => (
          <div key={`${it.name}-${i}`} className="rounded-xl bg-white px-4 py-3">
            <div className="flex justify-between">
              <span className="font-medium">{it.name}</span>
              <span className="text-sm tabular-nums">
                {it.kcal_low}–{it.kcal_high} cal
              </span>
            </div>
            <p className="mt-1 text-xs text-black/40">
              {Math.round(it.portion_g)} g · {it.assumption}
            </p>
          </div>
        ))}
      </div>

      <form action={deleteMeal}>
        <input type="hidden" name="id" value={meal.id} />
        <button className="w-full rounded-xl border border-black/10 py-3 text-sm text-black/60">Delete this meal</button>
      </form>
    </main>
  );
}
