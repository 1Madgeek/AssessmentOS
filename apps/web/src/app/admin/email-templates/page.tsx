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
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin">← Assessments</Link>
      </div>
      <h1 style={{ marginTop: 0 }}>Email templates</h1>
      <p style={{ color: "#656d76", lineHeight: 1.5 }}>
        Invite placeholders: <code>{"{{candidateName}}"}</code>,{" "}
        <code>{"{{candidateEmail}}"}</code>, <code>{"{{assessmentTitle}}"}</code>
        , <code>{"{{inviteUrl}}"}</code>, <code>{"{{expiresAt}}"}</code>,{" "}
        <code>{"{{recruiterName}}"}</code>. OTP also uses <code>{"{{otp}}"}</code>
        .
      </p>

      <label style={{ display: "grid", gap: 6, marginBottom: 16, maxWidth: 360 }}>
        Template
        <select
          style={inputStyle}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name} ({t.key})
            </option>
          ))}
        </select>
      </label>

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
