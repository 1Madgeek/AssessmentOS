# Contributing

Thanks for helping improve AssessmentOS.

## Development

1. Follow [[Local-Setup]].
2. Prefer small, focused PRs.
3. Keep new code under the `@assessment-os/*` package scope.
4. Run `pnpm --filter @assessment-os/core test` after changing session logic.
5. Documentation lives in `docs/` and syncs to the GitHub Wiki — edit markdown in the repo, not only on the wiki (wiki is overwritten on sync).

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
  }): Promise<GradeResult>;
  Builder?: unknown;
  Renderer?: unknown;
  Reviewer?: unknown;
}
```

### Steps

1. **Package** — `packages/question-<name>` with validate/grade (+ optional `react.tsx`).
2. **Register** — `apps/api/src/plugins-registry.ts`.
3. **Candidate-safe config** — strip secrets (hidden tests) in `candidateSafeConfig`.
4. **UI** — candidate `/t/[token]`, admin builder, session reviewer.
5. **Grading I/O** — keep pure scoring in the plugin; orchestrate runners in the API (see coding).
6. **Docs** — mention the type in [[Architecture]] / [[Question-Types]] when it graduates past a stub.

### Rules

- Activity event types are fixed: `focus_lost`, `paste`, `tab_hidden`, `save`, `submit`, `skip`, `open`.
- Session mutations go through core helpers — do not invent parallel state machines in the API.

Coding harness details: [[Coding-Runner]]. Agent authoring: [[MCP]].

## Wiki sync (maintainers)

See [[Home]] for enabling Wikis and setting the `WIKI_TOKEN` Actions secret. Workflow: `.github/workflows/sync-wiki.yml`.

## License

By contributing you agree your contributions are licensed under AGPL-3.0-only.
