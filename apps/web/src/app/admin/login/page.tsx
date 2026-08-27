"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { btnPrimary, inputStyle, pageStyle } from "@/lib/styles";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("recruiter@assessmentos.dev");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login({ email, password });
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ ...pageStyle, maxWidth: 420 }}>
      <h1>Recruiter login</h1>
      <p style={{ color: "#656d76" }}>
        Demo: recruiter@assessmentos.dev / password123
      </p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
        <button type="submit" style={btnPrimary} disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ color: "#656d76", fontSize: 13, marginTop: 24, lineHeight: 1.5 }}>
        After sign-in you can create API tokens and connect Claude, Codex, or
        Cursor via the AssessmentOS MCP server (create assessments, questions,
        invites, and query results from your agent).
      </p>
    </main>
  );
}
