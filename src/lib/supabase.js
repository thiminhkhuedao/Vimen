// src/lib/supabase.js — mobile, using Clerk for auth
import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Vinem] Missing Supabase env vars.\n" +
    "Copy .env.example → .env and fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY"
  );
}

let clerkGetToken = null;

export function setClerkTokenGetter(fn) {
  clerkGetToken = fn;
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  accessToken: async () => {
    if (!clerkGetToken) return null;
    try {
      return await clerkGetToken();
    } catch (err) {
      console.error("[supabase] failed to get Clerk token:", err);
      return null;
    }
  },
});
