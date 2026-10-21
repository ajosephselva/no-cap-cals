import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import OpenAI from "openai";

process.loadEnvFile(".env.local");

type Case = { case_id: string; filename: string; description: string; true_kcal: number; category: string; cooking_notes: string; expected: string };
type Row = Record<string, string | number | boolean>;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some((v) => v.trim())) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const toCsv = (rows: Row[]) => {
  const cols = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

async function main() {
  const { runAgentTurn, MODEL } = await import("../lib/ai/agent");
  const { buildEstimate, biggestUncertainty } = await import("../lib/ai/estimate");
  const simulator = new OpenAI({ timeout: 25_000 });
  const SIM_MODEL = process.env.EVAL_SIM_MODEL || "gpt-6-luna";

  const cases: Case[] = parseCsv(readFileSync("evals/cases.csv", "utf8")).map((r) => ({
    case_id: r.case_id, filename: r.filename, description: r.description, true_kcal: Number(r.true_kcal),
    category: r.category, cooking_notes: r.cooking_notes, expected: r.expected || "normal",
  }));
  const only = process.argv[2];
  const selected = only ? cases.filter((c) => c.case_id === only) : cases;

  const mimeOf = (f: string) => ({ ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp" })[extname(f).toLowerCase()];
  const imageFor = (c: Case) => {
    if (!c.filename) return undefined;
    const path = join("evals/photos", c.filename);
    if (!existsSync(path) || !mimeOf(c.filename)) throw new Error(`Missing or unsupported photo for ${c.case_id}: ${path}`);
    return `data:image/${mimeOf(c.filename)};base64,${readFileSync(path).toString("base64")}`;
  };

  async function simulateAnswer(question: { text: string; options: { label: string }[] }, notes: string) {
    const r = await simulator.responses.create({
      model: SIM_MODEL,
      instructions: "You are a user answering a food app's question truthfully using only your notes. Reply with exactly one option label from the list. If the notes don't cover it, reply with the option that says Not sure.",
      input: `Notes about my meal: ${notes || "(none)"}\nQuestion: ${question.text}\nOptions:\n${question.options.map((o) => `- ${o.label}`).join("\n")}`,
    });
    const text = r.output_text.trim().toLowerCase();
    return question.options.find((o) => text.includes(o.label.toLowerCase()))?.label ?? "Not sure";
  }

  const rows: Row[] = [];
  for (const c of selected) {
    process.stdout.write(`${c.case_id} ... `);
    try {
      const image = imageFor(c);
      const base = { imageDataUrl: image, description: c.description || undefined, exchanges: [] as { question: string; answer: string }[] };

      const t0 = Date.now();
      const zero = await runAgentTurn({ ...base, questionsRemaining: 0 });
      const zeroLatency = Date.now() - t0;
      const zeroEst = zero.turn.is_food ? buildEstimate(zero.turn) : null;

      let est = null as ReturnType<typeof buildEstimate> | null;
      let asked = 0;
      let isFood = true;
      const exchanges: { question: string; answer: string }[] = [];
      let previous: ReturnType<typeof buildEstimate>["items"] | undefined;
      let totalLatency = 0;
      const questionsLog: string[] = [];
      for (let turnNo = 0; turnNo <= 3; turnNo++) {
        const t1 = Date.now();
        const { turn } = await runAgentTurn({ ...base, exchanges, questionsRemaining: 3 - exchanges.length, previous, biggestUncertainty: previous ? biggestUncertainty(previous) : null });
        totalLatency += Date.now() - t1;
        if (!turn.is_food) { isFood = false; break; }
        est = buildEstimate(turn);
        previous = est.items;
        if (turn.decision !== "ask" || !turn.question || exchanges.length >= 3) break;
        const answer = await simulateAnswer(turn.question, c.cooking_notes);
        exchanges.push({ question: turn.question.text, answer });
        questionsLog.push(`${turn.question.text} -> ${answer}`);
        asked++;
      }

      const truth = c.true_kcal;
      const within = (e: typeof est) => (e && Number.isFinite(truth) ? truth >= e.kcal_low && truth <= e.kcal_high : "");
      const mid = (e: typeof est) => (e ? (e.kcal_low + e.kcal_high) / 2 : NaN);
      const hw = (e: typeof est) => (e ? (e.kcal_high - e.kcal_low) / 2 : NaN);
      const behaviorOk = c.expected === "not_food" ? !isFood : isFood;

      rows.push({
        case_id: c.case_id, category: c.category, expected: c.expected, behavior_ok: behaviorOk ? "yes" : "no", true_kcal: truth,
        zero_low: zeroEst?.kcal_low ?? "", zero_high: zeroEst?.kcal_high ?? "", zero_covered: within(zeroEst),
        final_low: est?.kcal_low ?? "", final_high: est?.kcal_high ?? "", final_covered: isFood ? within(est) : "",
        final_mid_error_pct: est && Number.isFinite(truth) ? Math.round((Math.abs(mid(est) - truth) / truth) * 1000) / 10 : "",
        zero_width_pct: zeroEst ? Math.round((hw(zeroEst) / mid(zeroEst)) * 1000) / 10 : "",
        final_width_pct: est ? Math.round((hw(est) / mid(est)) * 1000) / 10 : "",
        needed_scale: est && Number.isFinite(truth) && hw(est) > 0 ? Math.round((Math.abs(truth - mid(est)) / hw(est)) * 100) / 100 : "",
        questions_asked: asked, questions: questionsLog.join(" | "),
        zero_latency_ms: zeroLatency, agent_latency_ms: totalLatency, meal_name: est?.meal_name ?? "",
      });
      console.log(behaviorOk ? "done" : "BEHAVIOR MISMATCH");
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : err}`);
      rows.push({ case_id: c.case_id, category: c.category, expected: c.expected, behavior_ok: "error", error: String(err) });
    }
  }

  if (!rows.length) return console.log("No cases run.");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const out = `evals/results-${stamp}.csv`;
  writeFileSync(out, toCsv(rows));

  const scored = rows.filter((r) => r.expected === "normal" && r.final_covered !== "" && r.behavior_ok === "yes");
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : NaN);
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const scales = scored.map((r) => Number(r.needed_scale)).filter(Number.isFinite).sort((a, b) => a - b);
  const p80 = scales.length ? scales[Math.min(scales.length - 1, Math.ceil(scales.length * 0.8) - 1)] : NaN;

  const summary = [
    `Model: ${MODEL} | user simulator: ${SIM_MODEL} | cases: ${rows.length}`,
    `Behavior correct (food vs not-food): ${pct(rows.filter((r) => r.behavior_ok === "yes").length, rows.length)}`,
    `Coverage, no questions: ${pct(scored.filter((r) => r.zero_covered === true).length, scored.length)}`,
    `Coverage, after answers: ${pct(scored.filter((r) => r.final_covered === true).length, scored.length)}`,
    `Median best-estimate error: ${median(scored.map((r) => Number(r.final_mid_error_pct)))}%`,
    `Average range width (plus or minus): no questions ${avg(scored.map((r) => Number(r.zero_width_pct)))}%, after answers ${avg(scored.map((r) => Number(r.final_width_pct)))}%`,
    `Average questions asked: ${avg(rows.map((r) => Number(r.questions_asked)).filter(Number.isFinite))}`,
    `Calibration: multiply range widths by ${p80} to cover 80% of cases`,
    `Results written to ${out}`,
  ].join("\n");
  writeFileSync(out.replace(".csv", "-summary.txt"), summary);
  console.log(`\n${summary}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
