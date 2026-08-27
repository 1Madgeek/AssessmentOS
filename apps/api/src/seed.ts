import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "@assessment-os/db";
import {
  assessments,
  assessmentQuestions,
  questions,
  invites,
  recruiters,
} from "@assessment-os/db";
import { hashPassword, newToken } from "./auth.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://assessment:assessment@localhost:5433/assessmentos";

async function main() {
  const db = createDb(databaseUrl);

  const email = "recruiter@assessmentos.dev";
  let recruiter = (
    await db.select().from(recruiters).where(eq(recruiters.email, email)).limit(1)
  )[0];

  if (!recruiter) {
    recruiter = (
      await db
        .insert(recruiters)
        .values({
          email,
          name: "Demo Recruiter",
          passwordHash: await hashPassword("password123"),
        })
        .returning()
    )[0]!;
    console.log("Created recruiter:", email, "/ password123");
  } else {
    console.log("Recruiter already exists:", email);
  }

  const existing = await db
    .select()
    .from(assessments)
    .where(eq(assessments.title, "Backend Engineer (90 min)"))
    .limit(1);

  if (existing[0]) {
    console.log("Sample assessment already exists:", existing[0].id);
    const inv = await db
      .select()
      .from(invites)
      .where(eq(invites.assessmentId, existing[0].id))
      .limit(1);
    if (inv[0]) {
      console.log("Invite token:", inv[0].token);
      console.log(`Candidate URL: http://localhost:3000/t/${inv[0].token}`);
    }
    return;
  }

  const assessment = (
    await db
      .insert(assessments)
      .values({
        recruiterId: recruiter.id,
        title: "Backend Engineer (90 min)",
        description:
          "Sample AssessmentOS assessment with one MCQ and one coding problem.",
        durationSeconds: 90 * 60,
        rules: {
          allowSkip: true,
          allowReturn: true,
          perQuestionTimers: true,
          linearLock: false,
        },
        published: true,
      })
      .returning()
  )[0]!;

  const mcq = (
    await db
      .insert(questions)
      .values({
        type: "mcq",
        title: "HTTP status for created resource",
        prompt:
          "Which HTTP status code should a successful POST that creates a resource typically return?",
        timeLimitSeconds: 5 * 60,
        points: 10,
        config: {
          multiSelect: false,
          options: [
            { id: "a", label: "200 OK" },
            { id: "b", label: "201 Created" },
            { id: "c", label: "204 No Content" },
            { id: "d", label: "301 Moved Permanently" },
          ],
          correctOptionIds: ["b"],
        },
      })
      .returning()
  )[0]!;

  const coding = (
    await db
      .insert(questions)
      .values({
        type: "coding",
        title: "Sum of two numbers",
        prompt:
          "Read two integers from stdin and print their sum.\n\nExample input:\n2 3\nExample output:\n5",
        timeLimitSeconds: 30 * 60,
        points: 40,
        config: {
          language: "python",
          starterCode: `import sys

def main():
    a, b = map(int, sys.stdin.read().split())
    print(a + b)

if __name__ == '__main__':
    main()
`,
          visibleTests: [
            {
              id: "v1",
              label: "Example",
              stdin: "2 3\n",
              expectedStdout: "5\n",
            },
          ],
          hiddenTests: [
            {
              id: "h1",
              label: "Hidden 1",
              stdin: "10 20\n",
              expectedStdout: "30\n",
            },
            {
              id: "h2",
              label: "Hidden 2",
              stdin: "-1 1\n",
              expectedStdout: "0\n",
            },
          ],
        },
      })
      .returning()
  )[0]!;

  await db.insert(assessmentQuestions).values([
    { assessmentId: assessment.id, questionId: mcq.id, order: 0 },
    { assessmentId: assessment.id, questionId: coding.id, order: 1 },
  ]);

  const token = newToken();
  await db.insert(invites).values({
    assessmentId: assessment.id,
    token,
  });

  console.log("Seeded assessment:", assessment.id);
  console.log("Invite token:", token);
  console.log(`Candidate URL: http://localhost:3000/t/${token}`);
  console.log("Admin login: recruiter@assessmentos.dev / password123");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
