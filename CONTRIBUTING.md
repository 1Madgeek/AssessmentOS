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

## License

By contributing you agree your contributions are licensed under AGPL-3.0-only.
