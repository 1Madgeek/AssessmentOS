# Question types

Plugins implement `QuestionPlugin` from `@assessment-os/core` (`validateConfig`, `grade`, optional React Builder / Renderer / Reviewer).

## First-class types

### MCQ (`mcq`)

Multiple choice; single or multi-select. Option labels support rich text (TipTap). Graded by exact option-id match.

### Coding (`coding`)

Two modes:

- **`unit`** — pytest / Jest / PHPUnit / JUnit / GoogleTest (preferred for callable APIs)
- **`io`** — stdin/stdout cases

Also supports multi-file workspaces (`starterFiles` + `entryFile`), time/memory limits, proportional scoring, and optional Python I/O `checkerCode`. Details: [[Coding-Runner]].

### SQL (`sql`)

SQLite only. Config: `schemaSql`, `seedSql`, visible/hidden tests with `expectedRows`. Candidates submit a SELECT; hidden sets grade on submit. Hidden tests are stripped for candidates.

### Short answer (`text`)

`gradingMode`: `exact` | `contains_any` | `contains_all` | `manual`. Manual always needs recruiter review.

## Stubs

`video`, `design`, and `file` packages exist as stubs for a later plugin track (see [[Roadmap]]).
