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
import { ensureDefaultInviteTemplate } from "./email-templates.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://assessment:assessment@localhost:5433/assessmentos";

const javaCodingConfig = {
  language: "java" as const,
  mode: "unit" as const,
  framework: "junit" as const,
  entryFile: "Solution.java",
  starterCode: `public class Solution {
  public static int add(int a, int b) {
    // TODO: return the sum of a and b
    return 0;
  }
}
`,
  visibleTestCode: `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SolutionTest {
  @Test
  void addExample() {
    assertEquals(5, Solution.add(2, 3));
  }

  @Test
  void addZeros() {
    assertEquals(0, Solution.add(0, 0));
  }
}
`,
  hiddenTestCode: `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SolutionTest {
  @Test
  void addNegatives() {
    assertEquals(0, Solution.add(-1, 1));
  }

  @Test
  void addLarge() {
    assertEquals(30, Solution.add(10, 20));
  }
}
`,
  visibleTests: [] as [],
  hiddenTests: [] as [],
};

const phpCodingConfig = {
  language: "php" as const,
  mode: "unit" as const,
  framework: "phpunit" as const,
  entryFile: "solution.php",
  starterCode: `<?php
function add($a, $b) {
    // TODO: return the sum of a and b
}
`,
  visibleTestCode: `<?php
use PHPUnit\\Framework\\TestCase;
require_once 'solution.php';

class SolutionTest extends TestCase {
  public function testAddExample() {
    $this->assertSame(5, add(2, 3));
  }

  public function testAddZeros() {
    $this->assertSame(0, add(0, 0));
  }
}
`,
  hiddenTestCode: `<?php
use PHPUnit\\Framework\\TestCase;
require_once 'solution.php';

class SolutionTest extends TestCase {
  public function testAddNegatives() {
    $this->assertSame(0, add(-1, 1));
  }

  public function testAddLarge() {
    $this->assertSame(30, add(10, 20));
  }
}
`,
  visibleTests: [] as [],
  hiddenTests: [] as [],
};

const sqlConfig = {
  dialect: "sqlite" as const,
  schemaSql: `CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT NOT NULL
);
`,
  seedSql: `INSERT INTO employees (id, name, dept) VALUES
  (1, 'Ada', 'Eng'),
  (2, 'Bob', 'Sales'),
  (3, 'Lin', 'Eng');
`,
  starterQuery: "SELECT name FROM employees WHERE dept = 'Eng' ORDER BY id;\n",
  visibleTests: [
    {
      id: "v1",
      label: "Engineering names",
      expectedRows: [{ name: "Ada" }, { name: "Lin" }],
    },
  ],
  hiddenTests: [
    {
      id: "h1",
      label: "Engineering count",
      expectedRows: [{ name: "Ada" }, { name: "Lin" }],
    },
  ],
};

const textConfig = {
  gradingMode: "exact" as const,
  acceptedAnswers: ["201", "201 Created"],
  caseSensitive: false,
  normalizeWhitespace: true,
};

async function linkQuestion(
  db: ReturnType<typeof createDb>,
  assessmentId: string,
  questionId: string,
  order: number,
) {
  await db.insert(assessmentQuestions).values({
    assessmentId,
    questionId,
    order,
  });
}

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

  await ensureDefaultInviteTemplate(db, recruiter.id);

  const existing = await db
    .select()
    .from(assessments)
    .where(eq(assessments.title, "Backend Engineer (90 min)"))
    .limit(1);

  if (existing[0]) {
    console.log("Sample assessment already exists:", existing[0].id);
    const linked = await db
      .select({
        questionId: assessmentQuestions.questionId,
        type: questions.type,
        title: questions.title,
        config: questions.config,
        order: assessmentQuestions.order,
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

    let nextOrder = linked.reduce((m, q) => Math.max(m, q.order), -1) + 1;
    const types = new Set(linked.map((q) => q.type));
    const titles = new Set(linked.map((q) => q.title));

    if (!titles.has("Implement add(a, b) in PHP")) {
      const phpQ = (
        await db
          .insert(questions)
          .values({
            type: "coding",
            title: "Implement add(a, b) in PHP",
            prompt:
              "Implement PHP `add($a, $b)` that returns the sum of two integers. PHPUnit tests call your function.",
            timeLimitSeconds: 30 * 60,
            points: 40,
            config: phpCodingConfig,
          })
          .returning()
      )[0]!;
      await linkQuestion(db, existing[0].id, phpQ.id, nextOrder++);
      console.log("Added PHP coding question:", phpQ.id);
    }

    if (!titles.has("Implement add(a, b) in Java")) {
      const javaQ = (
        await db
          .insert(questions)
          .values({
            type: "coding",
            title: "Implement add(a, b) in Java",
            prompt:
              "Implement `Solution.add(a, b)` that returns the sum of two integers. JUnit 5 tests call your method.",
            timeLimitSeconds: 30 * 60,
            points: 40,
            config: javaCodingConfig,
          })
          .returning()
      )[0]!;
      await linkQuestion(db, existing[0].id, javaQ.id, nextOrder++);
      console.log("Added Java coding question:", javaQ.id);
    }

    if (!types.has("sql")) {
      const sqlQ = (
        await db
          .insert(questions)
          .values({
            type: "sql",
            title: "Employees in Engineering",
            prompt:
              "Write a SQLite SELECT that returns the `name` of employees in dept `Eng`, ordered by `id`.",
            timeLimitSeconds: 15 * 60,
            points: 25,
            config: sqlConfig,
          })
          .returning()
      )[0]!;
      await linkQuestion(db, existing[0].id, sqlQ.id, nextOrder++);
      console.log("Added SQL question:", sqlQ.id);
    }

    if (!types.has("text")) {
      const textQ = (
        await db
          .insert(questions)
          .values({
            type: "text",
            title: "Created resource status code",
            prompt:
              "What status code (number or short phrase) should a successful resource-creating POST return?",
            timeLimitSeconds: 5 * 60,
            points: 10,
            config: textConfig,
          })
          .returning()
      )[0]!;
      await linkQuestion(db, existing[0].id, textQ.id, nextOrder++);
      console.log("Added text question:", textQ.id);
    }

    await db
      .update(assessments)
      .set({
        description:
          "Sample AssessmentOS assessment: MCQ, Python + PHP + Java coding, SQL, and short answer.",
      })
      .where(eq(assessments.id, existing[0].id));

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
          "Sample AssessmentOS assessment: MCQ, Python + PHP + Java coding, SQL, and short answer.",
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

  const phpCoding = (
    await db
      .insert(questions)
      .values({
        type: "coding",
        title: "Implement add(a, b) in PHP",
        prompt:
          "Implement PHP `add($a, $b)` that returns the sum of two integers. PHPUnit tests call your function.",
        timeLimitSeconds: 30 * 60,
        points: 40,
        config: phpCodingConfig,
      })
      .returning()
  )[0]!;

  const javaCoding = (
    await db
      .insert(questions)
      .values({
        type: "coding",
        title: "Implement add(a, b) in Java",
        prompt:
          "Implement `Solution.add(a, b)` that returns the sum of two integers. JUnit 5 tests call your method.",
        timeLimitSeconds: 30 * 60,
        points: 40,
        config: javaCodingConfig,
      })
      .returning()
  )[0]!;

  const sqlQ = (
    await db
      .insert(questions)
      .values({
        type: "sql",
        title: "Employees in Engineering",
        prompt:
          "Write a SQLite SELECT that returns the `name` of employees in dept `Eng`, ordered by `id`.",
        timeLimitSeconds: 15 * 60,
        points: 25,
        config: sqlConfig,
      })
      .returning()
  )[0]!;

  const textQ = (
    await db
      .insert(questions)
      .values({
        type: "text",
        title: "Created resource status code",
        prompt:
          "What status code (number or short phrase) should a successful resource-creating POST return?",
        timeLimitSeconds: 5 * 60,
        points: 10,
        config: textConfig,
      })
      .returning()
  )[0]!;

  await db.insert(assessmentQuestions).values([
    { assessmentId: assessment.id, questionId: mcq.id, order: 0 },
    { assessmentId: assessment.id, questionId: coding.id, order: 1 },
    { assessmentId: assessment.id, questionId: phpCoding.id, order: 2 },
    { assessmentId: assessment.id, questionId: javaCoding.id, order: 3 },
    { assessmentId: assessment.id, questionId: sqlQ.id, order: 4 },
    { assessmentId: assessment.id, questionId: textQ.id, order: 5 },
  ]);

  const token = newToken();
  await db.insert(invites).values({
    assessmentId: assessment.id,
    token,
    status: "pending",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
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
