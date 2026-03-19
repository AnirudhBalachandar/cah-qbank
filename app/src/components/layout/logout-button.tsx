"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="outline" className="h-11 px-3" onClick={handleLogout}>
      <span className="hidden sm:inline">Sign out</span>
      <span className="sm:hidden">Logout</span>
    </Button>
  );
}
