"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailTemplate } from "@assessment-os/sdk";
import { api } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function EmailTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [key, setKey] = useState("invite");
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      const list = await api.listEmailTemplates();
      setTemplates(list);
      const initial = list.find((t) => t.key === "invite") ?? list[0] ?? null;
      if (initial) {
        setKey(initial.key);
        setTemplate(initial);
      }
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  useEffect(() => {
    const next = templates.find((t) => t.key === key);
    if (next) {
      setTemplate(next);
      setSaved(false);
    }
  }, [key, templates]);

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
      setTemplates((prev) =>
        prev.map((t) => (t.key === updated.key ? updated : t)),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.resetEmailTemplate(template.key);
      setTemplate(updated);
      setTemplates((prev) =>
        prev.map((t) => (t.key === updated.key ? updated : t)),
      );
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (!template) {
    return <main className={pageClass}>Loading…</main>;
  }

  return (
    <main className={pageClass}>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Email templates
        </h1>
        <p className={`${mutedClass} mt-2 leading-relaxed`}>
          Invite placeholders:{" "}
          <code className={codeInlineClass}>{"{{candidateName}}"}</code>,{" "}
          <code className={codeInlineClass}>{"{{candidateEmail}}"}</code>,{" "}
          <code className={codeInlineClass}>{"{{assessmentTitle}}"}</code>,{" "}
          <code className={codeInlineClass}>{"{{inviteUrl}}"}</code>,{" "}
          <code className={codeInlineClass}>{"{{expiresAt}}"}</code>,{" "}
          <code className={codeInlineClass}>{"{{recruiterName}}"}</code>. OTP
          also uses <code className={codeInlineClass}>{"{{otp}}"}</code>.
        </p>
      </div>

      <div className="grid max-w-sm gap-2">
        <Label>Template</Label>
        <Select
          selectedKey={key}
          onSelectionChange={(k) => {
            if (k != null) setKey(String(k));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.key} id={t.key} textValue={`${t.name} (${t.key})`}>
                {t.name} ({t.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-500">Saved.</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{template.name}</CardTitle>
          <CardDescription>Edit subject and body for this template.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
          <div className="flex flex-wrap gap-2">
            <Button isDisabled={busy} onPress={() => void save()}>
              Save
            </Button>
            <Button
              variant="outline"
              isDisabled={busy}
              onPress={() => void reset()}
            >
              Reset to default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <strong>{previewSubject}</strong>
          <div
            className="rounded-lg border border-border bg-card p-3 text-card-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </CardContent>
      </Card>
    </main>
  );
}
