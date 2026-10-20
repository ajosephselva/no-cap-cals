export type Sex = "male" | "female" | "unspecified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };
const GOAL_ADJUSTMENT: Record<Goal, number> = { lose: -500, maintain: 0, gain: 300 };
export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, unspecified: 1350 };

export function computeTargets(input: {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}) {
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + SEX_OFFSET[input.sex];
  const maintenance = bmr * ACTIVITY_FACTORS[input.activityLevel];
  const raw = maintenance + GOAL_ADJUSTMENT[input.goal];
  const dailyKcal = Math.round(Math.max(raw, CALORIE_FLOOR[input.sex]) / 10) * 10;
  const proteinG = Math.round(input.weightKg * 1.6);
  return { dailyKcal, proteinG, flooredBy: raw < CALORIE_FLOOR[input.sex] };
}

export function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
}

export function lbToKg(lb: number) {
  return Math.round(lb * 0.453592 * 10) / 10;
}
