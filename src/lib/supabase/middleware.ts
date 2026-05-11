import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

// Paths that require an authenticated user. Unauthenticated requests get
// redirected to /login with ?next= preserved so post-login they land back
// where they were trying to go. Add new private prefixes here.
const PROTECTED_PREFIXES = ["/dashboard"];

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    const originalPath = pathname + request.nextUrl.search;
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(originalPath)}`;
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
