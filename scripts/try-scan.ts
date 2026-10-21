import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

process.loadEnvFile(".env.local");

async function main() {
const { runAgentTurn, MODEL } = await import("../lib/ai/agent");
const { buildEstimate, biggestUncertainty } = await import("../lib/ai/estimate");

const [, , imagePath, ...rest] = process.argv;
const description = rest.join(" ") || undefined;
if (!imagePath && !description) {
  console.log('Usage: npx tsx scripts/try-scan.ts <photo.jpg> ["optional description"]');
  process.exit(1);
}

const mime = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp" }[extname(imagePath).toLowerCase()];
if (imagePath && imagePath !== "-" && !mime) {
  console.log("Use a .jpg, .png or .webp photo.");
  process.exit(1);
}
const imageDataUrl = imagePath && imagePath !== "-" ? `data:image/${mime};base64,${readFileSync(imagePath).toString("base64")}` : undefined;

const rl = createInterface({ input: stdin, output: stdout });
const exchanges: { question: string; answer: string }[] = [];
  let previous: import("../lib/ai/estimate").EstimatedItem[] | undefined;

console.log(`Model: ${MODEL}\n`);
for (let turnNo = 0; turnNo <= 3; turnNo++) {
  const t0 = Date.now();
  const { turn, retries, problems } = await runAgentTurn({ imageDataUrl, description, exchanges, questionsRemaining: 3 - exchanges.length, previous, biggestUncertainty: previous ? biggestUncertainty(previous) : null });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!turn.is_food) {
    console.log(`Not food (${secs}s).`);
    break;
  }
  const e = buildEstimate(turn);
  previous = e.items;
  console.log(`--- ${e.meal_name}: ${e.kcal_low}-${e.kcal_high} cal (${secs}s, retries ${retries}, confidence ${e.confidence}) ---`);
  for (const i of e.items) console.log(`  ${i.name} ${Math.round(i.portion_g)}g  ${i.kcal_low}-${i.kcal_high} cal  [${i.uncertainty}] ${i.assumption}`);
  console.log(`  P ${e.protein_g}g  C ${e.carbs_g}g  F ${e.fat_g}g${problems.length ? `  (math flag: ${problems.join("; ")})` : ""}`);
  if (turn.decision !== "ask" || !turn.question) break;
  console.log(`\nAgent asks: ${turn.question.text}  (${turn.question.reason})`);
  turn.question.options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}  ${o.kcal_effect}`));
  const pick = (await rl.question("Pick a number (or type an answer, or s to skip): ")).trim();
  if (pick.toLowerCase() === "s") break;
  const opt = turn.question.options[Number(pick) - 1];
  exchanges.push({ question: turn.question.text, answer: opt ? opt.label : pick });
  console.log();
}
rl.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
