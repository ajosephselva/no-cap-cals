import { z } from "zod";

export const UNCERTAINTY = ["low", "medium", "high"] as const;

export const ItemSchema = z.object({
  name: z.string().min(1).max(80),
  portion_g: z.number().min(0).max(3000),
  kcal_mid: z.number().min(0).max(2500),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  uncertainty: z.enum(UNCERTAINTY),
  assumption: z.string().max(160),
});

export const QuestionSchema = z.object({
  text: z.string().min(3).max(140),
  reason: z.string().max(160),
  options: z
    .array(z.object({ label: z.string().min(1).max(40), kcal_effect: z.string().max(40) }))
    .min(2)
    .max(5),
});

export const AgentTurnSchema = z.object({
  is_food: z.boolean(),
  meal_name: z.string().max(80),
  items: z.array(ItemSchema).max(15),
  label_detected: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  decision: z.enum(["ask", "final"]),
  question: QuestionSchema.nullable(),
  notes: z.string().max(200),
});

export type AgentItem = z.infer<typeof ItemSchema>;
export type AgentQuestion = z.infer<typeof QuestionSchema>;
export type AgentTurn = z.infer<typeof AgentTurnSchema>;

const str = { type: "string" } as const;
const num = { type: "number" } as const;

export const AGENT_TURN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "meal_name", "items", "label_detected", "confidence", "decision", "question", "notes"],
  properties: {
    is_food: { type: "boolean" },
    meal_name: str,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "portion_g", "kcal_mid", "protein_g", "carbs_g", "fat_g", "uncertainty", "assumption"],
        properties: {
          name: str,
          portion_g: num,
          kcal_mid: num,
          protein_g: num,
          carbs_g: num,
          fat_g: num,
          uncertainty: { type: "string", enum: [...UNCERTAINTY] },
          assumption: str,
        },
      },
    },
    label_detected: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    decision: { type: "string", enum: ["ask", "final"] },
    question: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["text", "reason", "options"],
          properties: {
            text: str,
            reason: str,
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "kcal_effect"],
                properties: { label: str, kcal_effect: str },
              },
            },
          },
        },
      ],
    },
    notes: str,
  },
} as const;
