"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match an account." };

  redirect("/today");
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email and a password." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (formData.get("adult") !== "on") return { error: "No Cap Cals is for adults 18 and older." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { age_confirmed: true },
    },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your inbox to confirm your email, then log in." };

  redirect("/today");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
