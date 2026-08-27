import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVITE_OTP_TEMPLATE,
  DEFAULT_INVITE_TEMPLATE,
  renderTemplate,
} from "./email-templates.js";

describe("renderTemplate", () => {
  it("substitutes placeholders", () => {
    expect(
      renderTemplate("Hi {{candidateName}} — {{assessmentTitle}}", {
        candidateName: "Alex",
        assessmentTitle: "Backend",
      }),
    ).toBe("Hi Alex — Backend");
  });

  it("replaces unknown keys with empty string", () => {
    expect(renderTemplate("x={{missing}}", {})).toBe("x=");
  });

  it("default invite template includes inviteUrl placeholder", () => {
    expect(DEFAULT_INVITE_TEMPLATE.subject).toContain("{{assessmentTitle}}");
    expect(DEFAULT_INVITE_TEMPLATE.bodyHtml).toContain("{{inviteUrl}}");
    expect(DEFAULT_INVITE_TEMPLATE.bodyText).toContain("{{inviteUrl}}");
  });

  it("default OTP template includes otp placeholder", () => {
    expect(DEFAULT_INVITE_OTP_TEMPLATE.bodyText).toContain("{{otp}}");
    expect(DEFAULT_INVITE_OTP_TEMPLATE.bodyHtml).toContain("{{otp}}");
  });
});
