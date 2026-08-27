# Authoring

## Rich prompts

Question prompts (and MCQ option labels) use TipTap JSON in `prompt_doc`. Plain `prompt` is kept as a derived text excerpt for lists/search.

Supported structure includes paragraphs, headings (h2/h3), bold/italic, lists, **blockquotes**, **fenced code blocks**, and **images**.

Images: `POST /assets` (recruiter auth), stored under `STORAGE_DIR` (default `./data/assets`), served at `GET /assets/:id`. Caps: 2MB, `image/*` only.

## Question bank

- Recruiter bank at `/admin/bank`
- **Add from bank** clones into an assessment (snapshot at add-time)
- MCP: `list_bank_items`, `create_bank_item`, `add_question_from_bank`, etc. — see [[MCP]]

## Sections

Optional `assessment_sections` (title, order, optional section timer). Questions can be assigned a `sectionId`. Candidate UI shows section headers/progress.

## Pools and randomize

- Rule: `randomizeQuestionOrder`
- Pools: name + `drawCount` + members (assessment questions and/or bank items)
- On session start: materialize fixed questions + pool draws (+ optional shuffle)
- Admin can preview a draw

## Publishing

Draft → **Publish**, then create invites. Unpublished assessments cannot issue invites.
