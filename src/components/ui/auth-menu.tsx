"use client";

import * as React from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signOutAction } from "@/app/auth/actions";
import { cn } from "@/lib/utils";

type Props = {
  // "inline" renders side-by-side for desktop nav; "stacked" renders full-
  // width buttons for the mobile menu drawer.
  layout?: "inline" | "stacked";
};

export function AuthMenu({ layout = "inline" }: Props) {
  const [user, setUser] = React.useState<User | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const stacked = layout === "stacked";
  const containerCls = stacked
    ? "flex w-full flex-col gap-2"
    : "flex items-center gap-2";
  const btnWidth = stacked ? "w-full" : "";

  // While we don't yet know the auth state, render reserved-width skeleton
  // buttons. This avoids a flash where signed-in users briefly see the
  // sign-in CTA before hydration completes.
  if (!ready) {
    return (
      <div className={containerCls} aria-hidden>
        <Button
          variant="outline"
          className={cn(btnWidth, "opacity-0 pointer-events-none")}
          disabled
        >
          Sign In
        </Button>
        <Button className={cn(btnWidth, "opacity-0 pointer-events-none")} disabled>
          Register a bot
        </Button>
      </div>
    );
  }

  if (user) {
    return (
      <div className={containerCls}>
        <span
          className={cn(
            "hidden truncate rounded-md border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground",
            stacked ? "block max-w-full" : "max-w-[180px] md:inline-block",
          )}
          title={user.email ?? undefined}
        >
          {user.email ?? "Signed in"}
        </span>
        <Button asChild className={btnWidth}>
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <form action={signOutAction} className={stacked ? "w-full" : undefined}>
          <Button type="submit" variant="outline" className={btnWidth}>
            Sign Out
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className={containerCls}>
      <Button asChild variant="outline" className={btnWidth}>
        <Link href="/login">Sign In</Link>
      </Button>
      <Button asChild className={btnWidth}>
        <Link href="/signup">Register a bot</Link>
      </Button>
    </div>
  );
}
