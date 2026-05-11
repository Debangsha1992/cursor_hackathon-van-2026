"use client";

import React from "react";
import { createPortal } from "react-dom";
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
          <a
            href="#"
            className="hover:bg-accent rounded-md p-2 -mx-2"
            aria-label="PaperPilot AI home"
          >
            <PaperPilotLogo />
          </a>
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent">
                  Product
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-background p-1 pr-1.5">
                  <ul className="bg-popover grid w-lg grid-cols-2 gap-2 rounded-md border p-2 shadow">
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
                  <div className="grid w-lg grid-cols-2 gap-2">
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
      <MobileMenu
        open={open}
        className="flex flex-col justify-between gap-2 overflow-y-auto"
      >
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
      </MobileMenu>
    </header>
  );
}

type MobileMenuProps = React.ComponentProps<"div"> & {
  open: boolean;
};

function MobileMenu({ open, children, className, ...props }: MobileMenuProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || typeof window === "undefined") return null;

  return createPortal(
    <div
      id="mobile-menu"
      className={cn(
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur-lg",
        "fixed top-14 right-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden border-y md:hidden",
      )}
    >
      <div
        data-slot={open ? "open" : "closed"}
        className={cn(
          "data-[slot=open]:animate-in data-[slot=open]:zoom-in-97 ease-out",
          "size-full p-4",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body,
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
    title: "Compliance Engine",
    href: "#",
    description: "Deterministic 0–100 score against your declared policy",
    icon: ShieldCheckIcon,
  },
  {
    title: "Behavior Dashboard",
    href: "#",
    description: "Score sparkline, top violations, and audit history",
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
