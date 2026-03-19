import Link from "next/link";
import { Menu } from "lucide-react";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/practice", label: "Practice" },
  { href: "/analytics", label: "Analytics" },
  { href: "/generate", label: "Generate" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ currentPath, userEmail, isAdmin }: { currentPath: string; userEmail: string; isAdmin: boolean }) {
  const nav = isAdmin ? [...navItems, { href: "/admin/generated", label: "Admin" }] : navItems;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))]">
        <div className="flex items-center gap-2 md:gap-3">
          <Badge variant="secondary">{SUBJECT_CONFIG.appName}</Badge>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  currentPath.startsWith(item.href) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11 md:hidden" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 md:hidden">
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {nav.map((item) => (
                <DropdownMenuItem key={item.href} asChild className="h-11 px-3">
                  <Link
                    href={item.href}
                    className={cn("w-full", currentPath.startsWith(item.href) ? "font-semibold text-foreground" : "text-muted-foreground")}
                  >
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground md:inline-block" aria-label="Signed in user email">
            {userEmail}
          </span>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
