import * as React from "react";
import { cn } from "@/lib/utils";

type LogoProps = React.ComponentProps<"div"> & {
  iconClassName?: string;
  wordmarkClassName?: string;
};

export function PaperPilotLogo({
  className,
  iconClassName,
  wordmarkClassName,
  ...props
}: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <PaperPilotMark className={cn("size-6 text-foreground", iconClassName)} />
      <span
        className={cn(
          "font-semibold tracking-tight text-foreground text-base leading-none",
          wordmarkClassName,
        )}
      >
        PaperPilot<span className="text-muted-foreground"> AI</span>
      </span>
    </div>
  );
}

export function PaperPilotMark(props: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Stylized paper plane / pilot mark */}
      <path d="M3 11.5 21 3l-7 18-3-8z" />
      <path d="M11 13l10-10" />
    </svg>
  );
}
