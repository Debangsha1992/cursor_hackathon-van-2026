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

// Alias matching the Supabase Next.js starter convention. Auth components
// generated from that template import `createClient` from this module, so
// re-exporting the browser factory under that name keeps both naming styles
// working.
export const createClient = createSupabaseBrowserClient;
