import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-black/40">No Cap Cals</p>
      <h1 className="mt-3 text-5xl font-black leading-[1.05] tracking-tight">
        Calories,
        <br />
        no cap.
      </h1>
      <p className="mt-4 text-lg text-black/60">
        Snap your meal. Get every item, every macro, and an honest range that tells you how sure we
        actually are.
      </p>

      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Chicken burrito bowl</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">medium confidence</span>
        </div>
        <p className="mt-3 text-3xl font-black">640–790 cal</p>
        <p className="mt-1 text-sm text-black/50">48g protein · 72g carbs · 24g fat</p>
        <p className="mt-3 text-xs text-black/40">Range widened: sauces and oils are hard to see.</p>
      </div>

      <Link
        href="/login"
        className="mt-8 rounded-xl bg-black py-4 text-center text-lg font-semibold text-lime-300"
      >
        Get started
      </Link>
    </main>
  );
}
