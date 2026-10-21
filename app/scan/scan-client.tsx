"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Estimate, EstimatedItem } from "@/lib/ai/estimate";
import { scaleItem, totals } from "@/lib/ai/estimate";
import type { AgentQuestion } from "@/lib/ai/schema";
import { logMeal } from "./actions";
import { EstimateHeader, Trail, type Step } from "@/components/estimate-view";

type Support = { title: string; body: string; resourceName: string; resourceUrl: string };
type ScanResponse = {
  sessionId?: string;
  status?: "ask" | "final" | "not_food" | "support";
  estimate?: Estimate;
  question?: AgentQuestion | null;
  questionsAsked?: number;
  flags?: string[];
  support?: Support;
  error?: { code: string; message: string };
};

type Phase = "pick" | "loading" | "ask" | "result" | "not_food" | "support" | "error";

const MAX_DIMENSION = 1024;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const LOADING_STEPS = ["Identifying foods", "Estimating portions", "Checking the math"];

async function resizeToJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function ScanClient() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [image, setImage] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"photo" | "text">("photo");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [items, setItems] = useState<EstimatedItem[]>([]);
  const [question, setQuestion] = useState<AgentQuestion | null>(null);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [flags, setFlags] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [support, setSupport] = useState<Support | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [scaleMax, setScaleMax] = useState(1000);
  const [copied, setCopied] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const pendingLabel = useRef("From your photo");
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase !== "loading") return;
    const id = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 2200);
    return () => clearInterval(id);
  }, [phase]);

  const live = useMemo(() => (estimate ? totals(items, estimate.label_detected) : null), [items, estimate]);

  function applyResponse(data: ScanResponse) {
    if (data.error) {
      setMessage(data.error.message);
      setPhase("error");
      return;
    }
    if (data.status === "support" && data.support) {
      setSupport(data.support);
      setPhase("support");
      return;
    }
    if (data.status === "not_food") {
      setPhase("not_food");
      return;
    }
    if (!data.estimate || !data.sessionId) {
      setMessage("Something went wrong. Try again.");
      setPhase("error");
      return;
    }
    const est = data.estimate;
    if (pendingLabel.current) setSteps((prev) => [...prev, { label: pendingLabel.current, low: est.kcal_low, high: est.kcal_high }]);
    setSessionId(data.sessionId);
    setEstimate(data.estimate);
    setItems(data.estimate.items);
    setQuestionsAsked(data.questionsAsked ?? 0);
    setFlags(data.flags ?? []);
    setScaleMax((prev) => (!sessionId ? Math.ceil((est.kcal_high * 1.15) / 100) * 100 : prev));
    if (data.status === "ask" && data.question) {
      setQuestion(data.question);
      setPhase("ask");
    } else {
      setQuestion(null);
      setPhase("result");
    }
  }

  async function post(body: Record<string, unknown>, showLoading = true) {
    if (showLoading) {
      setLoadingStep(0);
      setPhase("loading");
    }
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      applyResponse((await res.json()) as ScanResponse);
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
      setPhase("error");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      setMessage("That file isn't a photo. Use a JPEG or PNG, or describe the meal instead.");
      setPhase("error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage("That photo is too large. Try a smaller one or a screenshot.");
      setPhase("error");
      return;
    }
    try {
      setImage(await resizeToJpeg(file));
    } catch {
      setMessage("This browser can't read that photo format (often iPhone HEIC). Take a screenshot of it and upload that, or describe the meal.");
      setPhase("error");
    }
  }

  function start() {
    setSessionId(null);
    setSteps([]);
    pendingLabel.current = mode === "photo" ? "From your photo" : "From your description";
    if (mode === "photo" && image) post({ action: "start", image, note: note.trim() || undefined });
    else if (mode === "text" && description.trim().length >= 3) post({ action: "start", description: description.trim() });
  }

  function answer(label: string) {
    if (!sessionId) return;
    pendingLabel.current = label === "Not sure" ? "Not sure" : label;
    post({ action: "answer", sessionId, answer: label, image: image ?? undefined });
  }

  function skipAll() {
    if (!sessionId) return;
    pendingLabel.current = "";
    post({ action: "skip", sessionId });
  }

  function reset() {
    setPhase("pick");
    setImage(null);
    setDescription("");
    setNote("");
    setSessionId(null);
    setEstimate(null);
    setItems([]);
    setQuestion(null);
    setQuestionsAsked(0);
    setFlags([]);
    setMessage("");
    setSupport(null);
    setCopied(false);
    setScaleMax(1000);
    setSteps([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function editPortion(index: number, grams: number) {
    setItems((prev) => prev.map((it, i) => (i === index ? scaleItem(estimate!.items[i], Math.max(0, grams)) : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    if (!estimate || !items.length) return;
    startSaving(async () => {
      const result = await logMeal({
        sessionId,
        meal_name: estimate.meal_name,
        items,
        confidence: estimate.confidence,
        label_detected: estimate.label_detected,
        steps,
      });
      if (result?.error) {
        setMessage(result.error);
        setPhase("error");
      }
    });
  }

  async function copyBest() {
    if (!live) return;
    const best = Math.round((live.kcal_low + live.kcal_high) / 2 / 10) * 10;
    try {
      await navigator.clipboard.writeText(String(best));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const preview = image ? (
    <div className="h-48 w-full rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
  ) : null;

  if (phase === "pick") {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 rounded-full bg-black/5 p-1 text-sm font-medium">
          {(["photo", "text"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full py-2 ${mode === m ? "bg-white shadow-sm" : "text-black/50"}`}>
              {m === "photo" ? "Photo" : "Describe it"}
            </button>
          ))}
        </div>

        {mode === "photo" ? (
          <>
            {preview ?? (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-48 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/20 bg-white text-black/50"
              >
                <span className="text-3xl">📷</span>
                <span className="mt-2 font-medium">Take or upload a photo</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {image && (
              <button onClick={() => fileRef.current?.click()} className="text-sm text-black/50 underline">
                Use a different photo
              </button>
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Optional note, e.g. cooked in olive oil"
              className="rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black"
            />
          </>
        ) : (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="e.g. Big Mac, medium fries and a Diet Coke"
            className="rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black"
          />
        )}

        <button
          onClick={start}
          disabled={mode === "photo" ? !image : description.trim().length < 3}
          className="rounded-xl bg-black py-4 text-lg font-semibold text-lime-300 disabled:opacity-30"
        >
          Analyze
        </button>
        <p className="text-center text-xs text-black/40">Photos are analyzed and never stored.</p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col gap-6">
        {preview}
        <ul className="flex flex-col gap-3">
          {LOADING_STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 ${i <= loadingStep ? "text-black" : "text-black/30"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${i < loadingStep ? "bg-black" : i === loadingStep ? "animate-pulse bg-lime-500" : "bg-black/20"}`} />
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (phase === "ask" && estimate && question) {
    return (
      <div className="flex flex-col gap-6">
        {preview && <div className="h-28 w-full rounded-2xl bg-cover bg-center opacity-90" style={{ backgroundImage: `url(${image})` }} />}
        <div>
          <p className="mb-1 text-sm font-semibold text-black/50">{estimate.meal_name}</p>
          <EstimateHeader low={estimate.kcal_low} high={estimate.kcal_high} scaleMax={scaleMax} />
        </div>
        <Trail steps={steps} scaleMax={scaleMax} />
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Question {questionsAsked} of up to 3</p>
          <p className="mt-2 text-xl font-bold">{question.text}</p>
          <p className="mt-1 text-sm text-black/50">{question.reason}</p>
          <div className="mt-4 flex flex-col gap-2">
            {question.options.map((o) => (
              <button
                key={o.label}
                onClick={() => answer(o.label)}
                className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-left hover:border-black"
              >
                <span className="font-medium">{o.label}</span>
                <span className="text-sm text-black/50">{o.kcal_effect}</span>
              </button>
            ))}
          </div>
        </div>
        <button onClick={skipAll} className="rounded-xl border border-black/10 py-3 font-medium text-black/70">
          Skip, just estimate
        </button>
      </div>
    );
  }

  if (phase === "result" && estimate && live) {
    const best = Math.round((live.kcal_low + live.kcal_high) / 2 / 10) * 10;
    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-black/50">{estimate.meal_name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                estimate.confidence === "high" ? "bg-lime-200" : estimate.confidence === "medium" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"
              }`}
            >
              {estimate.confidence} confidence
            </span>
          </div>
          <div className="mt-1">
            <EstimateHeader low={live.kcal_low} high={live.kcal_high} scaleMax={Math.max(scaleMax, live.kcal_high)} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-black/60">
              {live.protein_g}g protein · {live.carbs_g}g carbs · {live.fat_g}g fat
            </p>
            <button onClick={copyBest} className="rounded-full bg-white px-3 py-1 text-sm font-medium">
              {copied ? "Copied" : `Copy ${best}`}
            </button>
          </div>
        </div>

        <Trail steps={steps} scaleMax={Math.max(scaleMax, live.kcal_high)} />

        {flags.includes("skipped") && <p className="text-xs text-black/50">You skipped the questions, so the range stays wider.</p>}
        {flags.includes("math_unverified") && <p className="text-xs text-amber-700">Less reliable estimate: the numbers didn&apos;t fully add up.</p>}
        {estimate.label_detected && <p className="text-xs text-black/50">Read from the nutrition label.</p>}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Items · tap grams to adjust</p>
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/20 px-4 py-6 text-center text-sm text-black/60">
              You removed every item, so there&apos;s nothing to log.{" "}
              <button onClick={() => setItems(estimate.items)} className="font-medium underline">
                Restore items
              </button>
            </div>
          )}
          {items.map((it, i) => (
            <div key={`${it.name}-${i}`} className="rounded-xl bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{it.name}</span>
                <button onClick={() => removeItem(i)} aria-label={`Remove ${it.name}`} className="text-black/30 hover:text-black">
                  ✕
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <label className="flex items-center gap-1 text-black/60">
                  <input
                    type="number"
                    min={0}
                    max={3000}
                    value={Math.round(it.portion_g)}
                    onChange={(e) => editPortion(i, Number(e.target.value))}
                    className="w-16 rounded-md border border-black/10 px-2 py-1"
                  />
                  g
                </label>
                <span className="tabular-nums">
                  {it.kcal_low}–{it.kcal_high} cal
                </span>
              </div>
              <p className="mt-1 text-xs text-black/40">{it.assumption}</p>
            </div>
          ))}
        </div>

        <button
          onClick={save}
          disabled={saving || !items.length}
          className="rounded-xl bg-black py-4 text-lg font-semibold text-lime-300 disabled:opacity-40"
        >
          {saving ? "Saving..." : "Log meal"}
        </button>
        <button onClick={reset} className="text-sm text-black/50 underline">
          Start over
        </button>
        <p className="text-center text-xs text-black/40">Estimates, not medical or dietary advice.</p>
      </div>
    );
  }

  if (phase === "not_food") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-4xl">🤔</p>
        <h2 className="text-2xl font-bold">We couldn&apos;t find food in this photo</h2>
        <p className="text-black/60">Try a clearer shot of your plate, or describe the meal instead.</p>
        <button onClick={reset} className="mt-2 rounded-xl bg-black px-6 py-3 font-semibold text-lime-300">
          Try again
        </button>
      </div>
    );
  }

  if (phase === "support" && support) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6">
        <h2 className="text-xl font-bold">{support.title}</h2>
        <p className="text-black/70">{support.body}</p>
        <a href={support.resourceUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-black py-3 text-center font-semibold text-lime-300">
          {support.resourceName}
        </a>
        <button onClick={reset} className="text-sm text-black/50 underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <h2 className="text-2xl font-bold">That didn&apos;t work</h2>
      <p className="text-black/60">{message || "Something went wrong. Try again."}</p>
      <button onClick={reset} className="mt-2 rounded-xl bg-black px-6 py-3 font-semibold text-lime-300">
        Start over
      </button>
    </div>
  );
}
