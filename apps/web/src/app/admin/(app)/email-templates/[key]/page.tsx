"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { EmailTemplate } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { codeInlineClass, errorClass, mutedClass, pageClass } from "@/lib/styles";

const SAMPLE_VARS = {
  candidateName: "Alex Candidate",
  candidateEmail: "alex@example.com",
  assessmentTitle: "Backend Engineer (90 min)",
  inviteUrl: "http://localhost:3000/t/example-token",
  expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  recruiterName: "Demo Recruiter",
  otp: "482913",
};

function preview(input: string): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return (SAMPLE_VARS as Record<string, string>)[key] ?? "";
  });
}

function keyTone(key: string) {
  switch (key) {
    case "invite":
      return "success" as const;
    case "otp":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

export default function EmailTemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ key: string }>();
  const templateKey = decodeURIComponent(params.key);
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      const activeId =
        getActiveOrgId() ??
        me.activeOrganization?.id ??
        me.organizations[0]?.id ??
        null;
      if (activeId) setActiveOrgId(activeId);
      setTemplate(await api.getEmailTemplate(templateKey));
      setReady(true);
    })().catch((err) => {
      setError(getErrorMessage(err, "Failed to load"));
      setReady(true);
    });
  }, [router, templateKey]);

  const previewSubject = useMemo(
    () => (template ? preview(template.subject) : ""),
    [template],
  );
  const previewHtml = useMemo(
    () => (template ? preview(template.bodyHtml) : ""),
    [template],
  );

  async function save() {
    if (!template) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateEmailTemplate(template.key, {
        name: template.name,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
      });
      setTemplate(updated);
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!template) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.resetEmailTemplate(template.key);
      setTemplate(updated);
    } catch (err) {
      setError(getErrorMessage(err, "Reset failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          className="text-sm text-emerald-600 dark:text-emerald-400"
        >
          Saved.
        </p>
      ) : null}

      {template ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {template.name}
                </h1>
                <StatusBadge tone={keyTone(template.key)}>
                  {template.key}
                </StatusBadge>
              </div>
              <p className={mutedClass}>
                Edit subject and body. Placeholders:{" "}
                <code className={codeInlineClass}>{"{{candidateName}}"}</code>,{" "}
                <code className={codeInlineClass}>{"{{candidateEmail}}"}</code>,{" "}
                <code className={codeInlineClass}>{"{{assessmentTitle}}"}</code>,{" "}
                <code className={codeInlineClass}>{"{{inviteUrl}}"}</code>,{" "}
                <code className={codeInlineClass}>{"{{expiresAt}}"}</code>,{" "}
                <code className={codeInlineClass}>{"{{recruiterName}}"}</code>,{" "}
                <code className={codeInlineClass}>{"{{otp}}"}</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                isDisabled={busy}
                onPress={() => void reset()}
              >
                Reset to default
              </Button>
              <Button isDisabled={busy} onPress={() => void save()}>
                Save
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base font-medium">
                  Content
                </CardTitle>
                <CardDescription>
                  Subject and HTML / plain-text bodies.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={template.name}
                    onChange={(e) =>
                      setTemplate({ ...template, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={template.subject}
                    onChange={(e) =>
                      setTemplate({ ...template, subject: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="html">HTML body</Label>
                  <Textarea
                    id="html"
                    className="min-h-[180px] font-mono text-xs"
                    value={template.bodyHtml}
                    onChange={(e) =>
                      setTemplate({ ...template, bodyHtml: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="text">Plain text body</Label>
                  <Textarea
                    id="text"
                    className="min-h-[140px] font-mono text-xs"
                    value={template.bodyText}
                    onChange={(e) =>
                      setTemplate({ ...template, bodyText: e.target.value })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base font-medium">
                  Preview
                </CardTitle>
                <CardDescription>
                  Sample values substituted for placeholders.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="font-medium">{previewSubject}</p>
                <div
                  className="rounded-none border border-border bg-card p-3 text-card-foreground"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : !error ? (
        <p className={mutedClass}>Template not found.</p>
      ) : null}
    </main>
  );
}
