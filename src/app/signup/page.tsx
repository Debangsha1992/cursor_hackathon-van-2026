import Link from "next/link";
import { redirect } from "next/navigation";

import { Header } from "@/components/ui/header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { SignupForm } from "./signup-form";

export const metadata = {
  title: "Create account — PaperPilot AI",
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-16 pb-24">
          <header className="mb-8">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Register
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight">
              Create your PaperPilot account
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Spin up bots, audit their paper trades against your declared
              policy, and own the data. No live execution, ever.
            </p>
          </header>

          <SignupForm initialError={params.error} />

          <p className="mt-6 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
