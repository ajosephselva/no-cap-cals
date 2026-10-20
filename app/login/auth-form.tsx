"use client";

import { useActionState, useState } from "react";
import { login, signup, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState);

  const isSignup = mode === "signup";
  const state = isSignup ? signupState : loginState;
  const pending = isSignup ? signupPending : loginPending;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 grid grid-cols-2 rounded-full bg-black/5 p-1 text-sm font-medium">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full py-2 transition ${mode === m ? "bg-white shadow-sm" : "text-black/50"}`}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form action={isSignup ? signupAction : loginAction} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black"
        />
        <input
          name="password"
          type="password"
          required
          minLength={isSignup ? 8 : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder="Password"
          className="rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black"
        />

        {isSignup && (
          <label className="flex items-start gap-2 text-sm text-black/70">
            <input name="adult" type="checkbox" required className="mt-1" />
            I&apos;m 18 or older. No Cap Cals gives estimates, not medical or dietary advice.
          </label>
        )}

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && <p className="text-sm text-green-700">{state.message}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-xl bg-black py-3 font-semibold text-lime-300 disabled:opacity-50"
        >
          {pending ? "One sec..." : isSignup ? "Create account" : "Log in"}
        </button>
      </form>
    </div>
  );
}
