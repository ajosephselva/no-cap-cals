"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { totals } from "@/lib/ai/estimate";

const Item = z
  .object({
    name: z.string().min(1).max(80),
    portion_g: z.number().min(0).max(3000),
    kcal_mid: z.number().min(0).max(5000),
    kcal_low: z.number().min(0).max(5000),
    kcal_high: z.number().min(0).max(5000),
    protein_g: z.number().min(0).max(500),
    carbs_g: z.number().min(0).max(800),
    fat_g: z.number().min(0).max(400),
    uncertainty: z.enum(["low", "medium", "high"]),
    assumption: z.string().max(200),
  })
  .refine((i) => i.kcal_high >= i.kcal_low);

const Payload = z.object({
  sessionId: z.string().uuid().nullable(),
  meal_name: z.string().trim().min(1).max(80),
  items: z.array(Item).min(1).max(15),
  confidence: z.enum(["high", "medium", "low"]),
  label_detected: z.boolean(),
  steps: z.array(z.object({ label: z.string().max(60), low: z.number().min(0), high: z.number().min(0) })).max(6),
});

export type LogResult = { error?: string };

export async function logMeal(input: z.infer<typeof Payload>): Promise<LogResult> {
  const user = await getUser();
  if (!user) redirect("/login");
  const { hasAccess } = await getAccess(user.id);
  if (!hasAccess) redirect("/paywall");

  const parsed = Payload.safeParse(input);
  if (!parsed.success) return { error: "Something about this meal looks off. Check the portions and try again." };
  const { sessionId, meal_name, items, confidence, label_detected, steps } = parsed.data;

  const t = totals(items, label_detected);
  if (t.kcal_high > 6000) return { error: "That's more than one meal's worth. Check the portions." };

  const supabase = await createClient();
  const { error } = await supabase.from("meals").insert({
    user_id: user.id,
    session_id: sessionId,
    name: meal_name,
    kcal_low: t.kcal_low,
    kcal_high: t.kcal_high,
    protein_g: t.protein_g,
    carbs_g: t.carbs_g,
    fat_g: t.fat_g,
    items,
    confidence,
    label_detected,
    steps,
  });
  if (error) return { error: "Couldn't save the meal. Try again." };
  redirect("/today");
}

export async function deleteMeal(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("meals").delete().eq("id", id);
  redirect("/today");
}
