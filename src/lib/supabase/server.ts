import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getSupabaseUrl,
} from "./env";

// Server-side Supabase client bound to the incoming request's cookies. Use
// from server components and route handlers — it carries the user's session
// so RLS policies see `auth.uid()` and grant them their own rows only.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // The `setAll` method was called from a Server Component. This is
          // fine when middleware refreshes the session; middleware runs on
          // every matched route, so the cookies are kept fresh elsewhere.
        }
      },
    },
  });
}

// Alias matching the Supabase Next.js starter convention. Route handlers
// generated from that template (e.g. `app/auth/confirm/route.ts`) import
// `createClient` from this module; re-exporting under that name keeps both
// naming styles working without churning every call site.
export const createClient = createSupabaseServerClient;

// Privileged server-only client that bypasses RLS. Use ONLY for trusted
// server paths (e.g. the HMAC-authenticated A2A route, where the caller has
// already been verified by signature, or background jobs). Never expose this
// client to user input without an explicit authorization decision.
export function createSupabaseServiceRoleClient() {
  return createServerClient(getSupabaseUrl(), getSupabaseSecretKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op — service-role client doesn't participate in user sessions.
      },
    },
  });
}
