import { and, eq } from "drizzle-orm";
import type { Db } from "@assessment-os/db";
import { emailTemplates } from "@assessment-os/db";

export const INVITE_TEMPLATE_KEY = "invite";
export const INVITE_OTP_TEMPLATE_KEY = "invite_otp";

export const DEFAULT_INVITE_TEMPLATE = {
  key: INVITE_TEMPLATE_KEY,
  name: "Assessment invite",
  subject: "You're invited: {{assessmentTitle}}",
  bodyHtml: `<p>Hi {{candidateName}},</p>
<p>{{recruiterName}} invited you to take <strong>{{assessmentTitle}}</strong>.</p>
<p><a href="{{inviteUrl}}">Start your assessment</a></p>
<p>This invite expires on {{expiresAt}}.</p>
<p>If the button does not work, open:<br/>{{inviteUrl}}</p>`,
  bodyText: `Hi {{candidateName}},

{{recruiterName}} invited you to take {{assessmentTitle}}.

Start your assessment: {{inviteUrl}}

This invite expires on {{expiresAt}}.
`,
};

export const DEFAULT_INVITE_OTP_TEMPLATE = {
  key: INVITE_OTP_TEMPLATE_KEY,
  name: "Invite verification code",
  subject: "Your verification code: {{assessmentTitle}}",
  bodyHtml: `<p>Hi,</p>
<p>Your verification code for <strong>{{assessmentTitle}}</strong> is:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:4px">{{otp}}</p>
<p>This code expires at {{expiresAt}}.</p>
<p>If you did not request this, you can ignore this email.</p>`,
  bodyText: `Your verification code for {{assessmentTitle}} is: {{otp}}

This code expires at {{expiresAt}}.

If you did not request this, you can ignore this email.
`,
};

export type TemplateVars = Record<string, string>;

export function renderTemplate(input: string, vars: TemplateVars): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return vars[key] ?? "";
  });
}

async function ensureTemplate(
  db: Db,
  organizationId: string,
  defaults: {
    key: string;
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
  },
): Promise<void> {
  const existing = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.organizationId, organizationId),
        eq(emailTemplates.key, defaults.key),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(emailTemplates).values({
    organizationId,
    ...defaults,
  });
}

export async function ensureDefaultInviteTemplate(
  db: Db,
  organizationId: string,
): Promise<void> {
  await ensureTemplate(db, organizationId, DEFAULT_INVITE_TEMPLATE);
  await ensureTemplate(db, organizationId, DEFAULT_INVITE_OTP_TEMPLATE);
}

export async function getInviteTemplate(db: Db, organizationId: string) {
  await ensureDefaultInviteTemplate(db, organizationId);
  const row = (
    await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.organizationId, organizationId),
          eq(emailTemplates.key, INVITE_TEMPLATE_KEY),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new Error("Invite template missing");
  return row;
}

export async function getInviteOtpTemplate(db: Db, organizationId: string) {
  await ensureDefaultInviteTemplate(db, organizationId);
  const row = (
    await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.organizationId, organizationId),
          eq(emailTemplates.key, INVITE_OTP_TEMPLATE_KEY),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new Error("Invite OTP template missing");
  return row;
}

export async function resetInviteTemplate(db: Db, organizationId: string) {
  await ensureDefaultInviteTemplate(db, organizationId);
  const updated = await db
    .update(emailTemplates)
    .set({
      name: DEFAULT_INVITE_TEMPLATE.name,
      subject: DEFAULT_INVITE_TEMPLATE.subject,
      bodyHtml: DEFAULT_INVITE_TEMPLATE.bodyHtml,
      bodyText: DEFAULT_INVITE_TEMPLATE.bodyText,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailTemplates.organizationId, organizationId),
        eq(emailTemplates.key, INVITE_TEMPLATE_KEY),
      ),
    )
    .returning();
  return updated[0]!;
}

export async function resetInviteOtpTemplate(db: Db, organizationId: string) {
  await ensureDefaultInviteTemplate(db, organizationId);
  const updated = await db
    .update(emailTemplates)
    .set({
      name: DEFAULT_INVITE_OTP_TEMPLATE.name,
      subject: DEFAULT_INVITE_OTP_TEMPLATE.subject,
      bodyHtml: DEFAULT_INVITE_OTP_TEMPLATE.bodyHtml,
      bodyText: DEFAULT_INVITE_OTP_TEMPLATE.bodyText,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailTemplates.organizationId, organizationId),
        eq(emailTemplates.key, INVITE_OTP_TEMPLATE_KEY),
      ),
    )
    .returning();
  return updated[0]!;
}
