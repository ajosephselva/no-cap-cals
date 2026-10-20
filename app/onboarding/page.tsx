import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const { profile, hasAccess } = await getAccess(user.id);
  if (profile) redirect(hasAccess ? "/today" : "/paywall");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-black/40">Step 1 of 2</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Let&apos;s set your daily target</h1>
      <p className="mt-2 mb-8 text-black/60">Takes 20 seconds. You can change it later.</p>
      <OnboardingForm />
    </main>
  );
}
