import type { NextRequest } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  // Match all paths except static assets and Next internals. The HMAC- and
  // shared-secret-authenticated webhook routes deliberately re-run through
  // here too so cookies stay consistent; they don't depend on cookies for
  // auth and tolerate the no-op refresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
