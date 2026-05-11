import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Email-confirmation / magic-link callback. Supabase redirects the browser
// here with a `code` query param after the user clicks the verification
// link; we exchange it for a session and forward the user to `next` (or
// /dashboard by default). Failures fall through to the login page with an
// error code so the user has somewhere to retry from.
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const fallback = new URL("/login", url.origin);
    fallback.searchParams.set("error", error.message);
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
