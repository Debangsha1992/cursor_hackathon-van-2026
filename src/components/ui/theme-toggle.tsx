"use client";

import * as React from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const current = (theme === "system" ? resolvedTheme : theme) ?? "light";
  const isDark = current === "dark";

  const toggle = React.useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark, setTheme]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={
        mounted
          ? `Switch to ${isDark ? "light" : "dark"} mode`
          : "Toggle theme"
      }
      className={className}
    >
      {/* Render both icons; CSS hides the inactive one to avoid SSR flash */}
      <SunIcon
        className="size-[1.1rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
        aria-hidden="true"
      />
      <MoonIcon
        className="absolute size-[1.1rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
        aria-hidden="true"
      />
    </Button>
  );
}
