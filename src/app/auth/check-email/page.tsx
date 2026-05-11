import Link from "next/link";

import { Header } from "@/components/ui/header";

export const metadata = {
  title: "Check your email — PaperPilot AI",
};

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-16 pb-24">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            One more step
          </p>
          <h1 className="mt-2 text-balance text-3xl font-medium leading-tight">
            Check your inbox
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We sent you a confirmation link. Open it on this device to finish
            creating your PaperPilot account. The link routes back through{" "}
            <code className="font-mono text-foreground">/auth/callback</code>{" "}
            to exchange the code for a session.
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Wrong email?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Try again
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
