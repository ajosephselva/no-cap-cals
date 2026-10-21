import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { ScanClient } from "./scan-client";

export default async function ScanPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const { profile, hasAccess } = await getAccess(user.id);
  if (!profile) redirect("/onboarding");
  if (!hasAccess) redirect("/paywall");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/today" className="text-sm text-black/50 hover:text-black">
          ← Today
        </Link>
        <span className="text-lg font-black tracking-tight">No Cap Cals</span>
        <span className="w-12" />
      </header>
      <ScanClient />
    </main>
  );
}
