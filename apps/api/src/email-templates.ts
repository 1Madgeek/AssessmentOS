import { and, eq } from "drizzle-orm";
import type { Db } from "@assessment-os/db";
import { emailTemplates } from "@assessment-os/db";

export const INVITE_TEMPLATE_KEY = "invite";

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

export type TemplateVars = Record<string, string>;

export function renderTemplate(input: string, vars: TemplateVars): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return vars[key] ?? "";
  });
}

export async function ensureDefaultInviteTemplate(
  db: Db,
  recruiterId: string,
): Promise<void> {
  const existing = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.recruiterId, recruiterId),
        eq(emailTemplates.key, INVITE_TEMPLATE_KEY),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(emailTemplates).values({
    recruiterId,
    ...DEFAULT_INVITE_TEMPLATE,
  });
}

export async function getInviteTemplate(db: Db, recruiterId: string) {
  await ensureDefaultInviteTemplate(db, recruiterId);
  const row = (
    await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.recruiterId, recruiterId),
          eq(emailTemplates.key, INVITE_TEMPLATE_KEY),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new Error("Invite template missing");
  return row;
}

export async function resetInviteTemplate(db: Db, recruiterId: string) {
  await ensureDefaultInviteTemplate(db, recruiterId);
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
        eq(emailTemplates.recruiterId, recruiterId),
        eq(emailTemplates.key, INVITE_TEMPLATE_KEY),
      ),
    )
    .returning();
  return updated[0]!;
}
