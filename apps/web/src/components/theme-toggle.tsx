"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn("bg-background", className)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      isDisabled={!mounted}
      onPress={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

/** Corner control for pages without a chrome header (login, candidate gate). */
export function ThemeToggleCorner() {
  return (
    <div className="fixed top-3 right-3 z-50">
      <ThemeToggle />
    </div>
  );
}
