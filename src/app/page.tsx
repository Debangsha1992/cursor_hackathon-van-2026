import { Header } from "@/components/ui/header";
import { HeroSection } from "@/components/ui/hero";

export default function HomePage() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <HeroSection />
      </main>
      <footer className="mx-auto mt-24 w-full max-w-5xl px-4 pb-8 pt-12 text-xs text-muted-foreground">
        <p className="border-t pt-6 leading-relaxed">
          <span className="font-medium text-foreground">Disclaimer:</span>{" "}
          PaperPilot AI is for paper-trading education and simulation only. It
          does not provide financial advice and does not execute real-money
          trades. No score band — at any value — should be read as a
          green-light to deploy a bot to live capital.
        </p>
      </footer>
    </div>
  );
}
