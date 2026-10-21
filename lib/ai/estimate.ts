import type { AgentItem, AgentTurn } from "./schema";

export const HALF_WIDTH = { low: 0.1, medium: 0.2, high: 0.35 } as const;
export const LABEL_HALF_WIDTH = 0.05;
export const MIN_MEAL_HALF_WIDTH = 0.08;
export const MACRO_TOLERANCE_ITEM = 0.25;
export const MACRO_TOLERANCE_MEAL = 0.15;
export const MAX_MEAL_KCAL = 5000;

const round10 = (n: number) => Math.round(n / 10) * 10;

export function macroKcal(item: Pick<AgentItem, "protein_g" | "carbs_g" | "fat_g">) {
  return 4 * item.protein_g + 4 * item.carbs_g + 9 * item.fat_g;
}

function relativeGap(a: number, b: number) {
  const base = Math.max(a, b, 1);
  return Math.abs(a - b) / base;
}

export function findProblems(turn: AgentTurn): string[] {
  const problems: string[] = [];
  if (!turn.is_food) return problems;
  if (turn.items.length === 0) problems.push("is_food is true but items is empty");

  for (const item of turn.items) {
    const fromMacros = macroKcal(item);
    if (item.kcal_mid >= 40 && relativeGap(fromMacros, item.kcal_mid) > MACRO_TOLERANCE_ITEM) {
      problems.push(
        `"${item.name}": macros imply ${Math.round(fromMacros)} kcal but kcal_mid is ${Math.round(item.kcal_mid)}`,
      );
    }
  }

  const total = turn.items.reduce((s, i) => s + i.kcal_mid, 0);
  const totalFromMacros = turn.items.reduce((s, i) => s + macroKcal(i), 0);
  if (total > MAX_MEAL_KCAL) problems.push(`meal total ${Math.round(total)} kcal is implausibly high`);
  if (total >= 40 && relativeGap(totalFromMacros, total) > MACRO_TOLERANCE_MEAL) {
    problems.push(`meal macros imply ${Math.round(totalFromMacros)} kcal but items sum to ${Math.round(total)}`);
  }
  if (turn.decision === "ask" && !turn.question) problems.push("decision is ask but question is null");
  return problems;
}

export type EstimatedItem = AgentItem & { kcal_low: number; kcal_high: number };

export type Estimate = {
  meal_name: string;
  items: EstimatedItem[];
  kcal_low: number;
  kcal_high: number;
  kcal_mid: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: AgentTurn["confidence"];
  label_detected: boolean;
  notes: string;
};

function combineHalfWidths(halfWidths: number[]) {
  return Math.sqrt(halfWidths.reduce((s, h) => s + h * h, 0));
}

function mealRange(mid: number, halfWidths: number[], minHalfWidthPct: number) {
  const hw = Math.max(combineHalfWidths(halfWidths), mid * minHalfWidthPct);
  return { low: Math.max(0, round10(mid - hw)), high: round10(mid + hw) };
}

export function buildEstimate(turn: AgentTurn): Estimate {
  const items: EstimatedItem[] = turn.items.map((item) => {
    const hw = turn.label_detected && item.uncertainty === "low" ? LABEL_HALF_WIDTH : HALF_WIDTH[item.uncertainty];
    return {
      ...item,
      kcal_low: round10(Math.max(0, item.kcal_mid * (1 - hw))),
      kcal_high: round10(item.kcal_mid * (1 + hw)),
    };
  });

  const mid = items.reduce((s, i) => s + i.kcal_mid, 0);
  const minHw = turn.label_detected ? LABEL_HALF_WIDTH : MIN_MEAL_HALF_WIDTH;
  const { low, high } = mealRange(mid, items.map((i) => (i.kcal_high - i.kcal_low) / 2), minHw);

  return {
    meal_name: turn.meal_name || "Meal",
    items,
    kcal_low: low,
    kcal_high: Math.max(high, low),
    kcal_mid: round10(mid),
    protein_g: Math.round(items.reduce((s, i) => s + i.protein_g, 0)),
    carbs_g: Math.round(items.reduce((s, i) => s + i.carbs_g, 0)),
    fat_g: Math.round(items.reduce((s, i) => s + i.fat_g, 0)),
    confidence: turn.confidence,
    label_detected: turn.label_detected,
    notes: turn.notes,
  };
}

export function biggestUncertainty(items: EstimatedItem[]) {
  if (!items.length) return null;
  const top = items.reduce((a, b) => (b.kcal_high - b.kcal_low > a.kcal_high - a.kcal_low ? b : a));
  const swing = Math.round((top.kcal_high - top.kcal_low) / 2);
  return swing >= 40 ? { name: top.name, swing } : null;
}

export function scaleItem(item: EstimatedItem, newPortionG: number): EstimatedItem {
  const factor = item.portion_g > 0 ? newPortionG / item.portion_g : 0;
  return {
    ...item,
    portion_g: Math.round(newPortionG),
    kcal_mid: item.kcal_mid * factor,
    kcal_low: round10(item.kcal_low * factor),
    kcal_high: round10(item.kcal_high * factor),
    protein_g: item.protein_g * factor,
    carbs_g: item.carbs_g * factor,
    fat_g: item.fat_g * factor,
  };
}

export function totals(items: EstimatedItem[], labelDetected = false) {
  const mid = items.reduce((s, i) => s + i.kcal_mid, 0);
  const minHw = labelDetected ? LABEL_HALF_WIDTH : MIN_MEAL_HALF_WIDTH;
  const { low, high } = mealRange(mid, items.map((i) => (i.kcal_high - i.kcal_low) / 2), minHw);
  return {
    kcal_low: low,
    kcal_high: Math.max(high, low),
    kcal_mid: round10(mid),
    protein_g: Math.round(items.reduce((s, i) => s + i.protein_g, 0)),
    carbs_g: Math.round(items.reduce((s, i) => s + i.carbs_g, 0)),
    fat_g: Math.round(items.reduce((s, i) => s + i.fat_g, 0)),
  };
}

export function combineRanges(ranges: { kcal_low: number; kcal_high: number }[]) {
  const mid = ranges.reduce((s, r) => s + (r.kcal_low + r.kcal_high) / 2, 0);
  const hw = combineHalfWidths(ranges.map((r) => (r.kcal_high - r.kcal_low) / 2));
  return { low: Math.max(0, round10(mid - hw)), high: round10(mid + hw), mid: round10(mid) };
}
