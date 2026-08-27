import { ApiError, getErrorMessage } from "@assessment-os/sdk";

/** Candidate-facing copy for dead invite links. */
export function inviteGateErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("revoked")) {
      return "This invite was revoked. Ask the recruiter for a new link.";
    }
    if (msg.includes("already used") || msg.includes("invite already used")) {
      return "This invite has already been used.";
    }
    if (msg.includes("expired")) {
      return "This invite has expired. Ask the recruiter for a new link.";
    }
    if (msg.includes("not published")) {
      return "This assessment is not available yet.";
    }
    if (err.status === 404 || msg.includes("not found")) {
      return "This invite link is invalid or no longer available.";
    }
    return err.message;
  }
  return getErrorMessage(err, "Invite not found");
}
