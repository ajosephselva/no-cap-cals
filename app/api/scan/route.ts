import { z } from "zod";
import { getUser, createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { runAgentTurn, AgentError, MODEL } from "@/lib/ai/agent";
import { buildEstimate, biggestUncertainty, type Estimate } from "@/lib/ai/estimate";
import { isConcerning, SUPPORT_MESSAGE } from "@/lib/ai/safety";
import type { Exchange } from "@/lib/ai/prompt";

export const maxDuration = 60;

const MAX_QUESTIONS = 3;
const DAILY_SCAN_LIMIT = 30;
const MAX_IMAGE_CHARS = 2_800_000;
const IMAGE_PREFIX = /^data:image\/(jpeg|png|webp);base64,/;

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    image: z.string().max(MAX_IMAGE_CHARS).regex(IMAGE_PREFIX).optional(),
    description: z.string().trim().min(3).max(500).optional(),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("answer"),
    sessionId: z.string().uuid(),
    image: z.string().max(MAX_IMAGE_CHARS).regex(IMAGE_PREFIX).optional(),
    answer: z.string().trim().min(1).max(120),
  }),
  z.object({ action: z.literal("skip"), sessionId: z.string().uuid() }),
]);

type StoredTurn = { question: string | null; answer: string | null; estimate: unknown; notes: string };

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return fail(401, "unauthenticated", "Please log in again.");
  const { profile, hasAccess } = await getAccess(user.id);
  if (!profile) return fail(403, "no_profile", "Finish setting up your profile first.");
  if (!hasAccess) return fail(402, "no_subscription", "Start your free trial to scan meals.");

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return fail(400, "bad_request", "That upload didn't look right. Try a JPEG or PNG photo, or describe the meal.");
  }

  const supabase = await createClient();

  if (body.action === "skip") {
    const { data: session } = await supabase.from("scan_sessions").select("*").eq("id", body.sessionId).maybeSingle();
    if (!session?.latest_estimate) return fail(404, "not_found", "That scan expired. Start a new one.");
    await supabase.from("scan_sessions").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("id", session.id);
    return json({ sessionId: session.id, status: "final", estimate: session.latest_estimate, question: null, questionsAsked: session.questions_asked, flags: ["skipped"] });
  }

  let sessionId: string;
  let exchanges: Exchange[] = [];
  let storedTurns: StoredTurn[] = [];
  let questionsAsked = 0;
  let totalLatency = 0;
  let totalRetries = 0;
  let description: string | undefined;
  let note: string | undefined;
  let previous: Estimate["items"] | undefined;

  if (body.action === "start") {
    if (!body.image && !body.description) return fail(400, "empty", "Add a photo or describe your meal.");
    if (isConcerning(body.description, body.note)) return json({ status: "support", support: SUPPORT_MESSAGE });

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabase.from("scan_sessions").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= DAILY_SCAN_LIMIT) return fail(429, "daily_limit", "You've hit today's scan limit. Try again tomorrow.");

    description = body.description;
    note = body.note;
    const { data: created, error } = await supabase
      .from("scan_sessions")
      .insert({ user_id: user.id, source: body.image ? "photo" : "text", model: MODEL, turns: [{ question: null, answer: null, estimate: null, notes: JSON.stringify({ description, note }) }] })
      .select("id")
      .single();
    if (error || !created) return fail(500, "storage", "Couldn't start the scan. Try again.");
    sessionId = created.id;
    storedTurns = [];
  } else {
    if (isConcerning(body.answer)) return json({ status: "support", support: SUPPORT_MESSAGE });
    const { data: session } = await supabase.from("scan_sessions").select("*").eq("id", body.sessionId).maybeSingle();
    if (!session || session.status !== "open") return fail(404, "not_found", "That scan expired. Start a new one.");
    sessionId = session.id;
    const turns = (session.turns ?? []) as StoredTurn[];
    const meta = JSON.parse(turns[0]?.notes || "{}") as { description?: string; note?: string };
    description = meta.description;
    note = meta.note;
    storedTurns = turns.slice(1);
    const last = storedTurns[storedTurns.length - 1];
    if (!last?.question) return fail(409, "no_question", "There's no open question on this scan.");
    last.answer = body.answer;
    exchanges = storedTurns.filter((t) => t.question && t.answer).map((t) => ({ question: t.question!, answer: t.answer! }));
    previous = (last.estimate as Estimate | null)?.items;
    questionsAsked = session.questions_asked;
    totalLatency = session.total_latency_ms;
    totalRetries = session.retries;
  }

  const started = Date.now();
  try {
    const { turn, retries, problems } = await runAgentTurn({
      imageDataUrl: body.image,
      description,
      note,
      exchanges,
      questionsRemaining: MAX_QUESTIONS - questionsAsked,
      previous,
      biggestUncertainty: previous ? biggestUncertainty(previous) : null,
    });
    const latency = Date.now() - started;

    if (!turn.is_food) {
      await supabase.from("scan_sessions").update({ status: "failed", total_latency_ms: totalLatency + latency, updated_at: new Date().toISOString() }).eq("id", sessionId);
      return json({ sessionId, status: "not_food" });
    }

    const estimate = buildEstimate(turn);
    const asking = turn.decision === "ask" && turn.question !== null && questionsAsked < MAX_QUESTIONS;
    const question = asking ? turn.question : null;
    const newQuestionsAsked = questionsAsked + (asking ? 1 : 0);

    const meta = { question: null, answer: null, estimate: null, notes: JSON.stringify({ description, note }) };
    const newTurns = [meta, ...storedTurns, { question: question?.text ?? null, answer: null, estimate, notes: turn.notes }];

    await supabase
      .from("scan_sessions")
      .update({
        turns: newTurns,
        questions_asked: newQuestionsAsked,
        status: asking ? "open" : "final",
        latest_estimate: estimate,
        total_latency_ms: totalLatency + latency,
        retries: totalRetries + retries,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    const flags = problems.length ? ["math_unverified"] : [];
    return json({ sessionId, status: asking ? "ask" : "final", estimate, question, questionsAsked: newQuestionsAsked, flags });
  } catch (err) {
    await supabase.from("scan_sessions").update({ status: "failed", total_latency_ms: totalLatency + (Date.now() - started), updated_at: new Date().toISOString() }).eq("id", sessionId);
    if (err instanceof AgentError && err.code === "timeout")
      return fail(504, "timeout", "Analysis is taking longer than usual. Try again, or describe the meal instead.");
    if (err instanceof AgentError && err.code === "invalid_output")
      return fail(502, "invalid_output", "We couldn't read this one reliably. Try another photo or describe it.");
    console.error("scan failed", err);
    return fail(502, "model_error", "The AI service had a hiccup. Try again in a moment.");
  }
}
