"use server";

import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import {
  computeTargets,
  feetInchesToCm,
  lbToKg,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/lib/nutrition/targets";

export type OnboardingState = { error?: string };

const SEXES: Sex[] = ["male", "female", "unspecified"];
const ACTIVITY: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];

export async function saveProfile(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const age = Number(formData.get("age"));
  const feet = Number(formData.get("feet"));
  const inches = Number(formData.get("inches") || 0);
  const lb = Number(formData.get("weight_lb"));
  const sex = String(formData.get("sex")) as Sex;
  const activityLevel = String(formData.get("activity")) as ActivityLevel;
  const goal = String(formData.get("goal")) as Goal;

  if (!Number.isFinite(age) || age < 18 || age > 100) return { error: "Age must be between 18 and 100." };
  if (!SEXES.includes(sex) || !ACTIVITY.includes(activityLevel) || !GOALS.includes(goal))
    return { error: "Pick an option for each question." };

  const heightCm = feetInchesToCm(feet, inches);
  const weightKg = lbToKg(lb);
  if (!(heightCm >= 120 && heightCm <= 230)) return { error: "Check your height." };
  if (!(weightKg >= 35 && weightKg <= 300)) return { error: "Check your weight." };

  const { dailyKcal, proteinG } = computeTargets({ age, sex, heightCm, weightKg, activityLevel, goal });

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    age,
    sex,
    height_cm: heightCm,
    weight_kg: weightKg,
    activity_level: activityLevel,
    goal,
    daily_kcal_target: dailyKcal,
    protein_target_g: proteinG,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Couldn't save your profile. Try again." };

  redirect("/paywall");
}
