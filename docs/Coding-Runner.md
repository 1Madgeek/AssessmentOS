# Coding runner

Coding questions are graded by `@assessment-os/runner` via the API.

## Mock vs Judge0

| Mode | When |
|---|---|
| **Mock** (default) | `USE_MOCK_RUNNER=true` or `JUDGE0_URL` unset — local processes (pytest, Jest via npx, PHPUnit, JUnit, g++, etc.) |
| **Judge0** | `JUDGE0_URL` set and `USE_MOCK_RUNNER=false` |

### Unit mode on Judge0

Unit questions submit a **multi-file** job (`language_id` **89**): zip of solution + tests + `compile` / `run` scripts. Output is parsed like the mock runner.

The stock `judge0/judge0` image may **not** include pytest, Jest, PHPUnit, or JUnit jars — use a custom image or keep the mock runner for local/CI.

I/O mode uses normal per-language Judge0 IDs.

## Unit config fields

| Field | Purpose |
|---|---|
| `language` | `python` → pytest; `javascript`/`typescript` → Jest; `php` → PHPUnit; `java` → JUnit 5; `cpp` → GoogleTest |
| `framework` | Derived if omitted |
| `entryFile` | Main solution path |
| `starterCode` | Entry file seed |
| `starterFiles` | Extra `{ path, content }[]` (max 20 files / 256KB with workspace) |
| `visibleTestCode` | Suite candidates can run |
| `hiddenTestCode` | Scoring suite — never sent to candidates |
| `timeLimitMs` / `memoryMb` | Runner limits |
| `scoring` | `proportional` (default) or `all_or_nothing` |
| `checkerCode` | Optional Python I/O checker (exit 0/1) |

Run uses the visible suite; submit grades from the hidden suite.

## stdin/stdout (`mode: "io"`)

```json
{
  "language": "python",
  "mode": "io",
  "starterCode": "...",
  "visibleTests": [{ "id": "v1", "stdin": "2 3\n", "expectedStdout": "5\n" }],
  "hiddenTests": [{ "id": "h1", "stdin": "10 20\n", "expectedStdout": "30\n" }]
}
```

Questions without `mode` behave as I/O for backward compatibility.

## Multi-file workspace

- **Entry file** content comes from starter code.
- **Additional starter files** ship as a path→content map; candidates edit in multi-tab UI.
- Save / run / submit send the full file map to the runner.

## Agent authoring

Via MCP `add_coding_question`, prefer `mode: "unit"` with both visible and hidden test files. Do not put scoring assertions only in `visible_test_code`.
