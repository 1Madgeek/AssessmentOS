"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      className="toaster group"
      position="bottom-right"
      closeButton
      richColors
    />
  );
}

export { toast };
