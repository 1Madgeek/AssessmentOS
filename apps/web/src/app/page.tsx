import Link from "next/link";
import { btnPrimary, btnSecondary, pageStyle } from "@/lib/styles";

export default function HomePage() {
  return (
    <main style={pageStyle}>
      <p style={{ color: "#656d76", marginBottom: 8 }}>Open source</p>
      <h1 style={{ fontSize: 42, margin: "0 0 12px" }}>AssessmentOS</h1>
      <p style={{ fontSize: 18, maxWidth: 560, lineHeight: 1.5 }}>
        Infrastructure for building, delivering, and reviewing technical
        assessments — MCQ, coding, and more — with a plugin-first architecture.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
        <Link href="/admin/login" style={{ ...btnPrimary, textDecoration: "none" }}>
          Recruiter login
        </Link>
        <a
          href="https://github.com"
          style={{ ...btnSecondary, textDecoration: "none" }}
        >
          Docs
        </a>
      </div>
    </main>
  );
}
