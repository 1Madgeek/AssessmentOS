import PDFDocument from "pdfkit";

export type SessionExportRow = {
  sessionId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  totalScore: number;
  maxScore: number;
  startedAt: string | null;
  submittedAt: string | null;
  questions: Array<{
    order: number;
    title: string;
    type: string;
    status: string;
    score: number | null;
    points: number;
  }>;
};

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function sessionToCsv(row: SessionExportRow): string {
  const lines = [
    [
      "sessionId",
      "candidateName",
      "candidateEmail",
      "status",
      "totalScore",
      "maxScore",
      "startedAt",
      "submittedAt",
      "questionOrder",
      "questionTitle",
      "questionType",
      "questionStatus",
      "questionScore",
      "questionPoints",
    ].join(","),
  ];
  for (const q of row.questions) {
    lines.push(
      [
        csvEscape(row.sessionId),
        csvEscape(row.candidateName),
        csvEscape(row.candidateEmail),
        csvEscape(row.status),
        csvEscape(row.totalScore),
        csvEscape(row.maxScore),
        csvEscape(row.startedAt),
        csvEscape(row.submittedAt),
        csvEscape(q.order),
        csvEscape(q.title),
        csvEscape(q.type),
        csvEscape(q.status),
        csvEscape(q.score),
        csvEscape(q.points),
      ].join(","),
    );
  }
  if (!row.questions.length) {
    lines.push(
      [
        csvEscape(row.sessionId),
        csvEscape(row.candidateName),
        csvEscape(row.candidateEmail),
        csvEscape(row.status),
        csvEscape(row.totalScore),
        csvEscape(row.maxScore),
        csvEscape(row.startedAt),
        csvEscape(row.submittedAt),
        "",
        "",
        "",
        "",
        "",
        "",
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function assessmentResultsToCsv(
  rows: Array<{
    sessionId: string;
    candidateName: string;
    candidateEmail: string;
    status: string;
    totalScore: number;
    maxScore: number;
    submittedAt: string | null;
  }>,
): string {
  const lines = [
    [
      "sessionId",
      "candidateName",
      "candidateEmail",
      "status",
      "totalScore",
      "maxScore",
      "submittedAt",
    ].join(","),
  ];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.sessionId),
        csvEscape(r.candidateName),
        csvEscape(r.candidateEmail),
        csvEscape(r.status),
        csvEscape(r.totalScore),
        csvEscape(r.maxScore),
        csvEscape(r.submittedAt),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export async function sessionToPdf(row: SessionExportRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("AssessmentOS session report", { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Candidate: ${row.candidateName} <${row.candidateEmail}>`);
    doc.text(`Status: ${row.status}`);
    doc.text(`Score: ${row.totalScore} / ${row.maxScore}`);
    if (row.startedAt) doc.text(`Started: ${row.startedAt}`);
    if (row.submittedAt) doc.text(`Submitted: ${row.submittedAt}`);
    doc.moveDown();
    doc.fontSize(14).text("Questions");
    doc.moveDown(0.5);
    doc.fontSize(11);
    for (const q of row.questions) {
      doc.text(
        `${q.order + 1}. ${q.title} (${q.type}) — ${q.status} — ${q.score ?? 0}/${q.points}`,
      );
    }
    doc.end();
  });
}

export function parseInviteCsv(text: string): {
  rows: Array<{ email: string; name?: string }>;
  errors: Array<{ row: number; message: string }>;
} {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errors: Array<{ row: number; message: string }> = [];
  const rows: Array<{ email: string; name?: string }> = [];
  if (!lines.length) return { rows, errors: [{ row: 0, message: "Empty CSV" }] };

  let start = 0;
  const header = lines[0]!.toLowerCase();
  if (header.includes("email")) start = 1;

  for (let i = start; i < lines.length; i++) {
    const parts = lines[i]!.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const email = parts[0] ?? "";
    const name = parts[1] || undefined;
    if (!email || !email.includes("@")) {
      errors.push({ row: i + 1, message: "Invalid email" });
      continue;
    }
    rows.push({ email: email.toLowerCase(), name });
  }
  return { rows, errors };
}
