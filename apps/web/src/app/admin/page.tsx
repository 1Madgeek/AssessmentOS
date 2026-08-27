"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Assessment } from "@assessment-os/sdk";
import { api } from "@/lib/api";
import { btnPrimary, btnSecondary, cardStyle, inputStyle, pageStyle } from "@/lib/styles";

export default function AdminHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      setUser(me);
      setAssessments(await api.listAssessments());
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  async function createAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const created = await api.createAssessment({
      title: title.trim(),
      durationSeconds: 60 * 60,
      rules: {
        allowSkip: true,
        allowReturn: true,
        perQuestionTimers: true,
        linearLock: false,
      },
    });
    router.push(`/admin/assessments/${created.id}`);
  }

  async function logout() {
    await api.logout();
    router.push("/admin/login");
  }

  if (!user) {
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Assessments</h1>
          <p style={{ color: "#656d76", margin: "4px 0 0" }}>
            {user.name} ({user.email})
          </p>
        </div>
        <button type="button" style={btnSecondary} onClick={() => void logout()}>
          Log out
        </button>
      </div>

      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      <form
        onSubmit={(e) => void createAssessment(e)}
        style={{ display: "flex", gap: 8, marginTop: 24 }}
      >
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="New assessment title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" style={btnPrimary}>
          Create
        </button>
      </form>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {assessments.map((a) => (
          <div key={a.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <Link href={`/admin/assessments/${a.id}`} style={{ fontWeight: 600 }}>
                  {a.title}
                </Link>
                <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>
                  {a.published ? "Published" : "Draft"} ·{" "}
                  {Math.round(a.durationSeconds / 60)} min
                </div>
              </div>
              <Link href={`/admin/assessments/${a.id}/sessions`} style={btnSecondary}>
                Results
              </Link>
            </div>
          </div>
        ))}
        {assessments.length === 0 ? (
          <p style={{ color: "#656d76" }}>No assessments yet. Create one above.</p>
        ) : null}
      </div>
    </main>
  );
}
