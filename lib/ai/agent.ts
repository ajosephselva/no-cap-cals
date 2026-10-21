import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserText, type Exchange, type PreviousItem } from "./prompt";
import { AGENT_TURN_JSON_SCHEMA, AgentTurnSchema, type AgentTurn } from "./schema";
import { findProblems } from "./estimate";

export const MODEL = process.env.OPENAI_MODEL || "gpt-6-sol";
const REASONING = (process.env.OPENAI_REASONING_EFFORT || "low") as "none" | "minimal" | "low" | "medium";

let client: OpenAI | null = null;
function getClient() {
  if (!client) client = new OpenAI({ timeout: 25_000, maxRetries: 1 });
  return client;
}

export class AgentError extends Error {
  constructor(public code: "timeout" | "model_error" | "invalid_output", message: string) {
    super(message);
  }
}

type TurnInput = {
  imageDataUrl?: string;
  description?: string;
  note?: string;
  exchanges: Exchange[];
  questionsRemaining: number;
  previous?: PreviousItem[];
  biggestUncertainty?: { name: string; swing: number } | null;
};

async function callModel(input: TurnInput, repairNote?: string): Promise<unknown> {
  const text = buildUserText({ ...input, hasImage: Boolean(input.imageDataUrl) });
  const content: OpenAI.Responses.ResponseInputContent[] = [
    { type: "input_text", text: repairNote ? `${text}\n\nYour previous answer had problems: ${repairNote}. Fix them and answer again.` : text },
  ];
  if (input.imageDataUrl) content.push({ type: "input_image", image_url: input.imageDataUrl, detail: "auto" });

  try {
    const response = await getClient().responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input: [{ role: "user", content }],
      reasoning: { effort: REASONING },
      text: { format: { type: "json_schema", name: "agent_turn", strict: true, schema: AGENT_TURN_JSON_SCHEMA } },
    });
    return JSON.parse(response.output_text);
  } catch (err) {
    if (err instanceof OpenAI.APIConnectionTimeoutError) throw new AgentError("timeout", "Model timed out");
    if (err instanceof SyntaxError) return null;
    throw new AgentError("model_error", err instanceof Error ? err.message : "Model call failed");
  }
}

export async function runAgentTurn(input: TurnInput): Promise<{ turn: AgentTurn; retries: number; problems: string[] }> {
  let repairNote: string | undefined;
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callModel(input, repairNote);
    const parsed = AgentTurnSchema.safeParse(raw);
    if (!parsed.success) {
      lastProblems = ["output did not match the required schema"];
      repairNote = lastProblems.join("; ");
      continue;
    }
    const turn = parsed.data;
    if (input.questionsRemaining <= 0 && turn.decision === "ask") {
      turn.decision = "final";
      turn.question = null;
    }
    const problems = findProblems(turn);
    if (problems.length === 0 || attempt === 1) return { turn, retries: attempt, problems };
    lastProblems = problems;
    repairNote = problems.join("; ");
  }

  throw new AgentError("invalid_output", lastProblems.join("; "));
}
