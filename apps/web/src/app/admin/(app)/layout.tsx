import type { ReactNode } from "react";
import { AdminShell } from "@/components/AdminShell";

export default function AdminAppLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
