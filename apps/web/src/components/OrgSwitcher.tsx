"use client";

import { useEffect, useState } from "react";
import type { MeResponse, OrganizationSummary } from "@assessment-os/sdk";
import { Building2 } from "lucide-react";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type Props = {
  me?: MeResponse | null;
  onChanged?: () => void;
};

export function OrgSwitcher({ me: meProp, onChanged }: Props) {
  const { state, isMobile } = useSidebar();
  const [me, setMe] = useState<MeResponse | null>(meProp ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meProp) {
      setMe(meProp);
      return;
    }
    void api
      .me()
      .then((m) => {
        if (m) {
          setMe(m);
          const stored = getActiveOrgId();
          const activeId = m.activeOrganization?.id ?? m.organizations[0]?.id;
          if (activeId && stored !== activeId) {
            setActiveOrgId(activeId);
          }
        }
      })
      .catch(() => undefined);
  }, [meProp]);

  if (!me || me.organizations.length === 0) return null;

  const activeId =
    getActiveOrgId() ??
    me.activeOrganization?.id ??
    me.organizations[0]?.id ??
    "";
  const active =
    me.organizations.find((o) => o.id === activeId) ?? me.organizations[0]!;

  async function switchOrg(org: OrganizationSummary) {
    if (org.id === active.id) return;
    setBusy(true);
    setError(null);
    try {
      await api.activateOrg(org.id);
      setActiveOrgId(org.id);
      if (onChanged) onChanged();
      else window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch org");
    } finally {
      setBusy(false);
    }
  }

  const collapsed = state === "collapsed" && !isMobile;

  if (collapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenuTrigger>
            <SidebarMenuButton
              isDisabled={busy}
              aria-label={`Organization: ${active.name}`}
            >
              <Building2 />
              <span className="truncate">{active.name}</span>
            </SidebarMenuButton>
            <DropdownMenu placement="right" className="min-w-56 w-auto">
              {me.organizations.map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  id={o.id}
                  textValue={`${o.name} (${o.role})`}
                  onAction={() => void switchOrg(o)}
                >
                  {o.name} ({o.role})
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          </DropdownMenuTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 overflow-hidden">
      <Label className="truncate text-xs text-muted-foreground">
        Organization
      </Label>
      <Select
        className="w-full min-w-0 max-w-full"
        selectedKey={active.id}
        onSelectionChange={(key) => {
          const org = me.organizations.find((o) => o.id === String(key));
          if (org) void switchOrg(org);
        }}
        isDisabled={busy}
      >
        <SelectTrigger className="h-8 w-full min-w-0 max-w-full overflow-hidden">
          <SelectValue className="min-w-0 flex-1 truncate [&>span]:truncate" />
        </SelectTrigger>
        <SelectContent>
          {me.organizations.map((o) => (
            <SelectItem key={o.id} id={o.id} textValue={`${o.name} (${o.role})`}>
              {o.name} ({o.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p className="truncate text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
