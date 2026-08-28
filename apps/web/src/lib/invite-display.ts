import type { InviteRecord } from "@assessment-os/sdk";

/** Display name + email for invite tables (works before a session/candidate exists). */
export function inviteCandidateDisplay(
  inv: Pick<InviteRecord, "candidateName" | "candidateEmail">,
): { primary: string; secondary: string | null; isOpenLink: boolean } {
  const name = inv.candidateName?.trim() || "";
  const email = inv.candidateEmail?.trim() || "";
  if (name && email) {
    return { primary: name, secondary: email, isOpenLink: false };
  }
  if (email) {
    return { primary: email, secondary: null, isOpenLink: false };
  }
  if (name) {
    return { primary: name, secondary: "Open link", isOpenLink: true };
  }
  return {
    primary: "Open link",
    secondary: "Email collected when they start",
    isOpenLink: true,
  };
}
