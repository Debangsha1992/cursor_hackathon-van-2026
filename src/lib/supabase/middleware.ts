import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

// Runs on every matched request. Refreshes the user's Supabase auth session
// (rotating short-lived JWTs) and pipes the updated cookies onto the
// response. Without this, server components see stale or expired sessions
// and `getUser()` starts returning null even though the user is signed in.
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() forces a token refresh if needed. Do not skip it,
  // and do not run other code between createServerClient and getUser() — see
  // https://supabase.com/docs/guides/auth/server-side/nextjs.
  await supabase.auth.getUser();

  return response;
}
