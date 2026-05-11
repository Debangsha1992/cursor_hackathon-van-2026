import type { ReactNode } from "react";

import { Header } from "@/components/ui/header";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/**
 * Shared layout shell for every page under `app/auth/*`. Renders the
 * marketing header so the auth flow matches the rest of the PaperPilot
 * look, and surfaces a small banner when the Supabase env vars haven't
 * been wired up yet.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const configured = hasSupabaseEnv();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex grow items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-sm">
          {!configured ? (
            <div className="mb-4 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              Supabase env vars are not set. The form renders, but submitting
              will fail until you copy{" "}
              <code className="font-mono">.env.local.example</code> to{" "}
              <code className="font-mono">.env.local</code> and fill in the
              keys from your Supabase project.
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
