"use client";

import React from "react";
import Link from "next/link";
import {
  ActivityIcon,
  BarChart3Icon,
  BookOpenIcon,
  FileText,
  GaugeIcon,
  HelpCircle,
  Leaf,
  type LucideIcon,
  PlugIcon,
  RotateCcw,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  Star,
  Users,
  WebhookIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { PaperPilotLogo } from "@/components/ui/paperpilot-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthMenu } from "@/components/ui/auth-menu";
import { cn } from "@/lib/utils";

type LinkItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description?: string;
};

export function Header() {
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn("sticky top-0 z-50 w-full border-b border-transparent", {
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 border-border backdrop-blur-lg":
          scrolled,
      })}
    >
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="hover:bg-accent rounded-md p-2 -mx-2"
            aria-label="PaperPilot AI home"
          >
            <PaperPilotLogo />
          </Link>
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent">
                  Product
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-background p-1 pr-1.5">
                  <ul className="bg-popover grid w-[36rem] grid-cols-2 gap-2 rounded-md border p-2 shadow">
                    {productLinks.map((item, i) => (
                      <li key={i}>
                        <ListItem {...item} />
                      </li>
                    ))}
                  </ul>
                  <div className="p-2">
                    <p className="text-muted-foreground text-sm">
                      Auditing a live agent?{" "}
                      <a
                        href="#"
                        className="text-foreground font-medium hover:underline"
                      >
                        Read the safety stance
                      </a>
                    </p>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent">
                  Resources
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-background p-1 pr-1.5 pb-1.5">
                  <div className="grid w-[36rem] grid-cols-2 gap-2">
                    <ul className="bg-popover space-y-2 rounded-md border p-2 shadow">
                      {resourceLinks.map((item, i) => (
                        <li key={i}>
                          <ListItem {...item} />
                        </li>
                      ))}
                    </ul>
                    <ul className="space-y-2 p-3">
                      {legalLinks.map((item, i) => (
                        <li key={i}>
                          <NavigationMenuLink
                            href={item.href}
                            className="flex p-2 hover:bg-accent flex-row rounded-md items-center gap-x-2"
                          >
                            <item.icon className="text-foreground size-4" />
                            <span className="font-medium">{item.title}</span>
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuLink className="px-4" asChild>
                <a href="#" className="hover:bg-accent rounded-md p-2 text-sm">
                  Pricing
                </a>
              </NavigationMenuLink>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <AuthMenu />
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            size="icon"
            variant="outline"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
          >
            <MenuToggleIcon open={open} className="size-5" duration={300} />
          </Button>
        </div>
      </nav>
      {open ? (
        <div
          id="mobile-menu"
          className={cn(
            "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur-lg",
            "fixed top-14 right-0 bottom-0 left-0 z-40 flex flex-col border-y md:hidden",
            "animate-in fade-in-0 duration-200 ease-out",
          )}
          onClick={(e) => {
            // Close when a nav link inside the menu is tapped, so users land on
            // the destination page without a stale overlay covering it.
            const target = e.target as HTMLElement;
            if (target.closest("a")) setOpen(false);
          }}
        >
          <div className="flex size-full flex-col justify-between gap-2 overflow-y-auto p-4">
            <NavigationMenu className="max-w-full">
              <div className="flex w-full flex-col gap-y-2">
                <span className="text-sm text-muted-foreground">Product</span>
                {productLinks.map((link) => (
                  <ListItem key={link.title} {...link} />
                ))}
                <span className="text-sm text-muted-foreground pt-2">
                  Resources
                </span>
                {resourceLinks.map((link) => (
                  <ListItem key={link.title} {...link} />
                ))}
                {legalLinks.map((link) => (
                  <ListItem key={link.title} {...link} />
                ))}
              </div>
            </NavigationMenu>
            <div className="flex flex-col gap-2">
              <AuthMenu layout="stacked" />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function ListItem({
  title,
  description,
  icon: Icon,
  className,
  href,
  ...props
}: React.ComponentProps<typeof NavigationMenuLink> & LinkItem) {
  return (
    <NavigationMenuLink
      className={cn(
        "w-full flex flex-row gap-x-2 data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:bg-accent/50 data-[active=true]:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground rounded-sm p-2",
        className,
      )}
      {...props}
      asChild
    >
      <a href={href}>
        <div className="bg-background/40 flex aspect-square size-12 items-center justify-center rounded-md border shadow-sm">
          <Icon className="text-foreground size-5" />
        </div>
        <div className="flex flex-col items-start justify-center">
          <span className="font-medium">{title}</span>
          {description ? (
            <span className="text-muted-foreground text-xs">{description}</span>
          ) : null}
        </div>
      </a>
    </NavigationMenuLink>
  );
}

const productLinks: LinkItem[] = [
  {
    title: "Bot-Score Engine",
    href: "#",
    description: "Deterministic 0–100 bot score against your declared policy",
    icon: ShieldCheckIcon,
  },
  {
    title: "Behavior Dashboard",
    href: "#",
    description: "Bot-score sparkline, top violations, and audit history",
    icon: BarChart3Icon,
  },
  {
    title: "HMAC Trade Intake",
    href: "#",
    description: "Replay-protected API for direct bot submissions",
    icon: ActivityIcon,
  },
  {
    title: "TradingView Bridge",
    href: "#",
    description: "Audit Pine alerts via shared-secret webhook",
    icon: WebhookIcon,
  },
  {
    title: "Backtester",
    href: "#",
    description: "Score discipline across many simulated trades",
    icon: GaugeIcon,
  },
  {
    title: "Policy Manager",
    href: "#",
    description: "Risk per trade, max trades per day, drawdown caps",
    icon: SlidersHorizontalIcon,
  },
];

const resourceLinks: LinkItem[] = [
  {
    title: "Docs",
    href: "#",
    description: "API reference, HMAC signing, violation codes",
    icon: BookOpenIcon,
  },
  {
    title: "Customer stories",
    href: "#",
    description: "How teams audit their AI trading agents",
    icon: Star,
  },
  {
    title: "Community",
    href: "#",
    description: "Compare scoring patterns with other builders",
    icon: Users,
  },
];

const legalLinks: LinkItem[] = [
  { title: "Terms of Service", href: "#", icon: FileText },
  { title: "Safety stance", href: "#", icon: ShieldCheckIcon },
  { title: "Refund Policy", href: "#", icon: RotateCcw },
  { title: "Changelog", href: "#", icon: Leaf },
  { title: "Help Center", href: "#", icon: HelpCircle },
  { title: "Integrations", href: "#", icon: PlugIcon },
];

function useScroll(threshold: number) {
  const [scrolled, setScrolled] = React.useState(false);

  const onScroll = React.useCallback(() => {
    setScrolled(window.scrollY > threshold);
  }, [threshold]);

  React.useEffect(() => {
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  React.useEffect(() => {
    onScroll();
  }, [onScroll]);

  return scrolled;
}
