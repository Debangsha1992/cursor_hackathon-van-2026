import Link from "next/link";
import { redirect } from "next/navigation";

import { Header } from "@/components/ui/header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — PaperPilot AI",
};

type PageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const params = await searchParams;
  if (user) {
    redirect(params.next ?? "/dashboard");
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-16 pb-24">
          <header className="mb-8">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Sign in
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight">
              Welcome back to the audit feed
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Use your PaperPilot account to register bots, view compliance
              scores, and review the deterministic paper-trade audit log.
            </p>
          </header>

          <LoginForm initialError={params.error} next={params.next} />

          <p className="mt-6 text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
