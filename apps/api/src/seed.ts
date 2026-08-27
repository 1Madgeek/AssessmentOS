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
    // Upgrade coding question to unit-test mode if still on I/O seed shape
    const linked = await db
      .select({
        questionId: assessmentQuestions.questionId,
        type: questions.type,
        title: questions.title,
        config: questions.config,
      })
      .from(assessmentQuestions)
      .innerJoin(questions, eq(assessmentQuestions.questionId, questions.id))
      .where(eq(assessmentQuestions.assessmentId, existing[0].id));
    const codingQ = linked.find((q) => q.type === "coding");
    if (codingQ) {
      const cfg = codingQ.config as { mode?: string };
      if (cfg.mode !== "unit") {
        await db
          .update(questions)
          .set({
            title: "Implement add(a, b)",
            prompt:
              "Implement `add(a, b)` that returns the sum of two integers.\n\nDo not print — return the value. Visible and hidden unit tests call your function.",
            config: {
              language: "python",
              mode: "unit",
              framework: "pytest",
              entryFile: "solution.py",
              starterCode: `def add(a, b):
    # TODO: return the sum of a and b
    pass
`,
              visibleTestCode: `from solution import add


def test_add_example():
    assert add(2, 3) == 5


def test_add_zeros():
    assert add(0, 0) == 0
`,
              hiddenTestCode: `from solution import add


def test_add_negatives():
    assert add(-1, 1) == 0


def test_add_large():
    assert add(10, 20) == 30
`,
              visibleTests: [],
              hiddenTests: [],
            },
          })
          .where(eq(questions.id, codingQ.questionId));
        console.log("Upgraded coding question to unit mode:", codingQ.questionId);
      }
    }
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
        title: "Implement add(a, b)",
        prompt:
          "Implement `add(a, b)` that returns the sum of two integers.\n\nDo not print — return the value. Visible and hidden unit tests call your function.",
        timeLimitSeconds: 30 * 60,
        points: 40,
        config: {
          language: "python",
          mode: "unit",
          framework: "pytest",
          entryFile: "solution.py",
          starterCode: `def add(a, b):
    # TODO: return the sum of a and b
    pass
`,
          visibleTestCode: `from solution import add


def test_add_example():
    assert add(2, 3) == 5


def test_add_zeros():
    assert add(0, 0) == 0
`,
          hiddenTestCode: `from solution import add


def test_add_negatives():
    assert add(-1, 1) == 0


def test_add_large():
    assert add(10, 20) == 30
`,
          visibleTests: [],
          hiddenTests: [],
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
