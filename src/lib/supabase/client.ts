"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

// Browser-side Supabase client. Used from client components for sign-in,
// sign-up, and any user-scoped reads that should obey RLS. The publishable
// key is safe to ship to the browser; it is enforced against RLS policies
// server-side.
export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
}
