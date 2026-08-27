# Contributing

Thanks for helping improve AssessmentOS.

## Development

1. Follow the local setup in [README.md](./README.md).
2. Prefer small, focused PRs.
3. Keep new code under the `@assessment-os/*` package scope.
4. Run `pnpm --filter @assessment-os/core test` after changing session logic.

## Adding a question type

Question types implement the `QuestionPlugin` contract from `@assessment-os/core`:

```ts
interface QuestionPlugin<TConfig, TAnswer> {
  type: string;
  validateConfig(input: unknown): TConfig;
  grade(args: {
    config: TConfig;
    answer: TAnswer | null;
    workspace?: unknown;
    points: number;
  }): Promise<GradeResult>; // { score, maxScore, details? }
  Builder?: unknown;
  Renderer?: unknown;
  Reviewer?: unknown;
}
```

### Steps

1. **Package** — copy a stub under `packages/question-<type>` (e.g. `question-sql`) or create `packages/question-<name>` with:
   - `validateConfig` / `grade` / `*Plugin` export
   - optional `src/react.tsx` for Builder / Renderer / Reviewer
   - `package.json` name `@assessment-os/question-<name>`

2. **Register** — in `apps/api/src/plugins-registry.ts`, import and `registry.register(...)`.

3. **Candidate-safe config** — if config contains secrets (hidden tests, keys), strip them in `candidateSafeConfig`.

4. **UI** — wire Renderer in `apps/web/src/app/t/[token]/page.tsx`, Builder in the admin assessment page, and Reviewer on the session review page.

5. **Grading side effects** — if grading needs an external runner (like coding + Judge0), keep pure scoring in the plugin and orchestrate I/O in `apps/api/src/session-service.ts` (see coding path).

6. **Docs** — mention the type in the README architecture table if it graduates past a stub.

### Rules reminders

- Activity event types are fixed in core: `focus_lost`, `paste`, `tab_hidden`, `save`, `submit`, `skip`, `open`.
- Session mutations go through core helpers (`openQuestion`, `saveAttempt`, `skipQuestion`, `submitQuestion`, `submitSession`, `tickTimers`) — do not invent parallel state machines in the API.

## Coding question harness

Coding questions support two modes in `config.mode`:

### Unit tests (`mode: "unit"`) — preferred for callable APIs

Use when candidates implement functions/classes that tests call directly (TestDome-style).

| Field | Purpose |
|---|---|
| `language` | `python` → pytest; `javascript` / `typescript` → Jest; `php` → PHPUnit |
| `framework` | `pytest`, `jest`, or `phpunit` (derived if omitted) |
| `entryFile` | e.g. `solution.py` / `solution.js` / `solution.php` |
| `starterCode` | Candidate starting source |
| `visibleTestCode` | Test file candidates can run via “Run visible tests” |
| `hiddenTestCode` | Scoring suite — never sent to candidates (`candidateSafeConfig` strips it) |

Example (Python):

```json
{
  "language": "python",
  "mode": "unit",
  "framework": "pytest",
  "entryFile": "solution.py",
  "starterCode": "def add(a, b):\n    pass\n",
  "visibleTestCode": "from solution import add\n\ndef test_add():\n    assert add(2, 3) == 5\n",
  "hiddenTestCode": "from solution import add\n\ndef test_hidden():\n    assert add(-1, 1) == 0\n"
}
```

Run uses the visible suite; submit grades from the hidden suite. Local mock runner executes pytest/Jest/PHPUnit in a temp workspace. Java/C++ stay I/O-only for now.

### SQL (`type: "sql"`)

SQLite-only. Config: `schemaSql`, `seedSql`, `visibleTests` / `hiddenTests` with `expectedRows`. Candidates submit a single SELECT; hidden result sets grade on submit. `candidateSafeConfig` strips `hiddenTests`.

### Text / short answer (`type: "text"`)

Config: `gradingMode` (`exact` | `contains_any` | `contains_all` | `manual`), `acceptedAnswers`, optional `maxLength`. Manual mode always needs recruiter review (score 0 + `needsReview`).

### stdin/stdout (`mode: "io"`, default)

Legacy case arrays:

```json
{
  "language": "python",
  "mode": "io",
  "starterCode": "...",
  "visibleTests": [{ "id": "v1", "stdin": "2 3\\n", "expectedStdout": "5\\n" }],
  "hiddenTests": [{ "id": "h1", "stdin": "10 20\\n", "expectedStdout": "30\\n" }]
}
```

Existing questions without `mode` keep working as I/O.

### Agent / MCP authoring

When creating coding questions via MCP `add_coding_question`, prefer `mode: "unit"` with both visible and hidden test files. Structure tool args so `config` is a complete validated coding config (see above). Do not put scoring assertions only in `visibleTestCode`.

Invites created via MCP are single-use. Pass `candidate_email` to send mail; use `resend_invite` to resend a pending invite.

## License

By contributing you agree your contributions are licensed under AGPL-3.0-only.
