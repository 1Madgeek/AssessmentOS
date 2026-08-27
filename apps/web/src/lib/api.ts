import { createClient } from "@assessment-os/sdk";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ORG_STORAGE_KEY = "aos_org_id";

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveOrgId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(ORG_STORAGE_KEY, id);
    else localStorage.removeItem(ORG_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export const api = createClient(API_URL, {
  organizationId: () => getActiveOrgId(),
});
