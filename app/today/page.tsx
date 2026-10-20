import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { logout } from "../login/actions";

export default async function TodayPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="text-xl font-black tracking-tight">No Cap Cals</span>
        <form action={logout}>
          <button className="text-sm text-black/50 hover:text-black">Log out</button>
        </form>
      </header>
      <section className="mt-16 text-center">
        <h1 className="text-3xl font-bold">You&apos;re in.</h1>
        <p className="mt-2 text-black/60">Signed in as {user.email}</p>
        <p className="mt-8 text-sm text-black/40">Meal scanning lands in Phase 6.</p>
      </section>
    </main>
  );
}
