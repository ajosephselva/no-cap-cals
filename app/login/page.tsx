import Link from "next/link";
import { AuthForm } from "./auth-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-2xl font-black tracking-tight">
        No Cap Cals
      </Link>
      <AuthForm />
    </main>
  );
}
