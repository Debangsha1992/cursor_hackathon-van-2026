import { Header } from "@/components/ui/header";
import { NewBotForm } from "@/components/bots/new-bot-form";

export const metadata = {
  title: "Register a bot - PaperPilot AI",
};

export default function NewBotPage() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-24">
          <header className="mb-10">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Bot registration
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
              Declare your bot's policy
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              PaperPilot audits trades against the rules you commit to here.
              You can change these later, but every audit is scored against
              the policy that was active at submission time.
            </p>
          </header>

          <NewBotForm />
        </div>
      </main>
    </div>
  );
}
