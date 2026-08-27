"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Library,
  Users,
  Settings,
  Mail,
  Bot,
  Circle,
} from "lucide-react";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { ProfileMenu } from "@/components/ProfileMenu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminBreadcrumbs } from "@/components/AdminBreadcrumbs";

const WORKSPACE_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/admin" },
  { href: "/admin/assessments", label: "Assessments", icon: ClipboardList, match: (p: string) => p.startsWith("/admin/assessments") },
  { href: "/admin/bank", label: "Question bank", icon: Library, match: (p: string) => p.startsWith("/admin/bank") },
  { href: "/admin/candidates", label: "Candidates", icon: Users, match: (p: string) => p.startsWith("/admin/candidates") },
  { href: "/admin/email-templates", label: "Email templates", icon: Mail, match: (p: string) => p.startsWith("/admin/email-templates") },
  { href: "/admin/mcp", label: "MCP / Agents", icon: Bot, match: (p: string) => p.startsWith("/admin/mcp") },
];

const SETTINGS_NAV = [
  { href: "/admin/org", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/admin/org") },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton href="/admin" size="lg" className="font-semibold">
                <Circle className="size-4 fill-current" />
                <span>AssessmentOS</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKSPACE_NAV.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      href={item.href}
                      isActive={item.match(pathname)}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SETTINGS_NAV.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      href={item.href}
                      isActive={item.match(pathname)}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <OrgSwitcher />
          <SidebarSeparator />
          <ProfileMenu />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <AdminBreadcrumbs />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
