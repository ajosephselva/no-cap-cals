"use client";

import { useActionState } from "react";
import { saveProfile, type OnboardingState } from "./actions";

const field = "rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black";

function Choice({ name, options }: { name: string; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([value, label], i) => (
        <label key={value} className="cursor-pointer">
          <input type="radio" name={name} value={value} defaultChecked={i === 0} className="peer sr-only" />
          <span className="block rounded-full border border-black/10 bg-white px-4 py-2 text-sm peer-checked:border-black peer-checked:bg-black peer-checked:text-lime-300">
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(saveProfile, {});

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">
          Age
          <input name="age" type="number" min={18} max={100} required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Height (ft)
          <input name="feet" type="number" min={4} max={7} required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          (in)
          <input name="inches" type="number" min={0} max={11} defaultValue={0} className={field} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">
          Weight (lb)
          <input name="weight_lb" type="number" min={80} max={660} required className={field} />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Sex (for the calorie formula)</span>
        <Choice name="sex" options={[["male", "Male"], ["female", "Female"], ["unspecified", "Prefer not to say"]]} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">How active are you?</span>
        <Choice
          name="activity"
          options={[
            ["sedentary", "Mostly sitting"],
            ["light", "Light"],
            ["moderate", "Moderate"],
            ["active", "Active"],
            ["very_active", "Very active"],
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Goal</span>
        <Choice name="goal" options={[["maintain", "Maintain"], ["lose", "Lose"], ["gain", "Gain"]]} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button disabled={pending} className="rounded-xl bg-black py-4 font-semibold text-lime-300 disabled:opacity-50">
        {pending ? "Calculating..." : "See my targets"}
      </button>
      <p className="text-xs text-black/40">
        Targets use a standard formula with a minimum floor. Estimates only, not medical or dietary advice.
      </p>
    </form>
  );
}
