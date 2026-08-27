"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MeResponse } from "@assessment-os/sdk";
import { Building2, ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function ProfileMenu() {
  const router = useRouter();
  const { isMobile, state } = useSidebar();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    void api
      .me()
      .then((m) => {
        if (m) setMe(m);
      })
      .catch(() => undefined);
  }, []);

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    router.replace("/admin/login");
  }

  if (!me) return null;

  const collapsed = state === "collapsed" && !isMobile;
  const avatarSrc = resolveMediaUrl(me.avatarUrl);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenuTrigger>
          <SidebarMenuButton
            size="lg"
            className="data-[popup-open]:bg-sidebar-accent"
            tooltip={collapsed ? me.name : undefined}
            aria-label="Account menu"
          >
            <Avatar size="sm" className="rounded-none after:rounded-none">
              {avatarSrc ? (
                <AvatarImage src={avatarSrc} alt="" className="rounded-none" />
              ) : null}
              <AvatarFallback className="rounded-none text-[10px]">
                {initials(me.name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-xs leading-tight">
              <span className="truncate font-medium">{me.name}</span>
              <span className="truncate text-muted-foreground">{me.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 opacity-60" />
          </SidebarMenuButton>
          <DropdownMenu placement="top start" className="min-w-56 w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{me.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {me.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              textValue="Profile"
              onAction={() => router.push("/admin/profile")}
            >
              <UserRound className="size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              textValue="Organization settings"
              onAction={() => router.push("/admin/org")}
            >
              <Building2 className="size-4" />
              Organization settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem textValue="Log out" onAction={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
