import Link from "next/link";

import { PaperPilotLogo } from "@/components/ui/paperpilot-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

import { UserMenu } from "./user-menu";

export interface SlimHeaderProps {
  email: string;
}

export function SlimHeader({ email }: SlimHeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="-mx-2 rounded-md p-2 hover:bg-accent">
          <PaperPilotLogo />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={email} />
        </div>
      </div>
    </header>
  );
}
