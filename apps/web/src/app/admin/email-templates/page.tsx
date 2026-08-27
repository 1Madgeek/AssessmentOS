"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailTemplate } from "@assessment-os/sdk";
import { api } from "@/lib/api";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageStyle,
} from "@/lib/styles";

const SAMPLE_VARS = {
  candidateName: "Alex Candidate",
  candidateEmail: "alex@example.com",
  assessmentTitle: "Backend Engineer (90 min)",
  inviteUrl: "http://localhost:3000/t/example-token",
  expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  recruiterName: "Demo Recruiter",
};

function preview(input: string): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return (SAMPLE_VARS as Record<string, string>)[key] ?? "";
  });
}

export default function EmailTemplatesPage() {
  const router = useRouter();
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
      setTemplate(await api.getEmailTemplate("invite"));
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

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
      setTemplate(
        await api.updateEmailTemplate("invite", {
          name: template.name,
          subject: template.subject,
          bodyHtml: template.bodyHtml,
          bodyText: template.bodyText,
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      setTemplate(await api.resetEmailTemplate("invite"));
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (!template) {
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin">← Assessments</Link>
      </div>
      <h1 style={{ marginTop: 0 }}>Email templates</h1>
      <p style={{ color: "#656d76", lineHeight: 1.5 }}>
        Placeholders:{" "}
        <code>{"{{candidateName}}"}</code>, <code>{"{{candidateEmail}}"}</code>,{" "}
        <code>{"{{assessmentTitle}}"}</code>, <code>{"{{inviteUrl}}"}</code>,{" "}
        <code>{"{{expiresAt}}"}</code>, <code>{"{{recruiterName}}"}</code>
      </p>

      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
      {saved ? <p style={{ color: "#1a7f37" }}>Saved.</p> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{template.name}</h2>
        <label>
          Subject
          <input
            style={inputStyle}
            value={template.subject}
            onChange={(e) =>
              setTemplate({ ...template, subject: e.target.value })
            }
          />
        </label>
        <label>
          HTML body
          <textarea
            style={{ ...inputStyle, minHeight: 180, fontFamily: "monospace" }}
            value={template.bodyHtml}
            onChange={(e) =>
              setTemplate({ ...template, bodyHtml: e.target.value })
            }
          />
        </label>
        <label>
          Plain text body
          <textarea
            style={{ ...inputStyle, minHeight: 140, fontFamily: "monospace" }}
            value={template.bodyText}
            onChange={(e) =>
              setTemplate({ ...template, bodyText: e.target.value })
            }
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void save()}>
            Save
          </button>
          <button type="button" style={btnSecondary} disabled={busy} onClick={() => void reset()}>
            Reset to default
          </button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 24, display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Preview</h2>
        <strong>{previewSubject}</strong>
        <div
          style={{
            border: "1px solid #d0d7de",
            borderRadius: 6,
            padding: 12,
            background: "#fff",
          }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </section>
    </main>
  );
}
