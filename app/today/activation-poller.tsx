"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ActivationPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 30_000) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {timedOut ? (
        <>
          <h1 className="text-2xl font-bold">Still confirming your payment</h1>
          <p className="mt-2 text-black/60">Stripe can take a minute. Refresh this page shortly.</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-black" />
          <h1 className="mt-6 text-2xl font-bold">Activating your trial...</h1>
          <p className="mt-2 text-black/60">This usually takes a few seconds.</p>
        </>
      )}
    </main>
  );
}
