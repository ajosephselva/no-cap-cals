"use client";

import { useEffect, useRef, useState } from "react";

function useAnimatedNumber(target: number) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export type Step = { label: string; low: number; high: number; question?: string };

export function EstimateHeader({ low, high, scaleMax }: { low: number; high: number; scaleMax: number }) {
  const best = Math.round((low + high) / 2 / 10) * 10;
  const shown = useAnimatedNumber(best);
  const lo = useAnimatedNumber(low);
  const hi = useAnimatedNumber(high);
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / scaleMax) * 100))}%`;
  const spread = Math.round(((high - low) / 2 / Math.max(best, 1)) * 100);
  return (
    <div>
      <p className="text-5xl font-black tracking-tight tabular-nums">
        {lo.toLocaleString()}–{hi.toLocaleString()}
        <span className="ml-2 text-xl font-semibold text-black/50">cal</span>
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm text-black/70 tabular-nums">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
        Best estimate <span className="font-bold text-black">{shown.toLocaleString()} cal</span>
        <span className="text-black/40">· ±{spread}%</span>
      </p>
      <div className="relative mt-4 h-3 rounded-full bg-black/10">
        <div
          className="absolute h-3 rounded-full bg-black transition-all duration-700 ease-out"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow transition-all duration-700 ease-out"
          style={{ left: pct(best) }}
        />
      </div>
    </div>
  );
}

export function Trail({ steps, scaleMax }: { steps: Step[]; scaleMax: number }) {
  if (steps.length < 2) return null;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / scaleMax) * 100))}%`;
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-black/40">How your answers narrowed it</p>
      <ul className="mt-3 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i}>
            {s.question && <p className="text-xs text-black/40">{s.question}</p>}
            <div className="flex justify-between gap-3 text-sm">
              <span className={i === steps.length - 1 ? "font-semibold" : "text-black/60"}>{s.label}</span>
              <span className="tabular-nums text-black/60">
                {s.low.toLocaleString()}–{s.high.toLocaleString()}
              </span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-black/5">
              <div
                className={`absolute h-2 rounded-full ${i === steps.length - 1 ? "bg-black" : "bg-black/30"}`}
                style={{ left: pct(s.low), width: `calc(${pct(s.high)} - ${pct(s.low)})` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}


export function CopyNumber({ value }: { value: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-full bg-white px-3 py-1 text-sm font-medium"
    >
      {copied ? "Copied" : `Copy ${value}`}
    </button>
  );
}
