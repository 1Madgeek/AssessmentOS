"use client";

import { useEffect, useState } from "react";
import type { MeResponse, OrganizationSummary } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { inputStyle } from "@/lib/styles";

type Props = {
  me?: MeResponse | null;
  onChanged?: () => void;
};

export function OrgSwitcher({ me: meProp, onChanged }: Props) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13, color: "#656d76" }}>
          Org{" "}
          <select
            style={{ ...inputStyle, display: "inline-block", width: "auto" }}
            value={active.id}
            disabled={busy}
            onChange={(e) => {
              const org = me.organizations.find((o) => o.id === e.target.value);
              if (org) void switchOrg(org);
            }}
          >
            {me.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 13, color: "#656d76" }}>
          {active.name} · {active.role}
        </span>
      </div>
      {error ? (
        <p style={{ margin: 0, color: "#cf222e", fontSize: 13 }}>{error}</p>
      ) : null}
    </div>
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
