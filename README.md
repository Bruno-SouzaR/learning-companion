# learning-companion

A local-first learning engine. You feed it material (PDF, Markdown), a local LLM turns it into structured
sections in a Markdown wiki, and then it makes you work on that material: graded quizzes, spaced-repetition
reviews, recall sessions and a tutor chat that answers from the document you are studying. Everything runs
on your machine, against your own model server — no cloud account.

## The four things it does

| Flow | What happens |
|---|---|
| **Summarize** | Upload a PDF (or paste Markdown); the text is cleaned, split into section chunks at 3,500 tokens and synthesized section by section into wiki notes with key points, tables and LaTeX preserved |
| **Quiz** | Generates 1–20 questions from a note (default 10), grades free-text answers semantically and schedules retries for what you missed |
| **Recall** | Daily review queue driven by a spaced-repetition engine; session turns are persisted so progress survives a restart |
| **Ask** | Tutor chat scoped to one document: the route slices the note down to the relevant ~2,000 tokens for each question, so long files do not blow past the local model's context |

## Status

| Part | State |
|---|---|
| Markdown wiki with frontmatter and sections | works |
| PDF and Markdown ingestion, with job tracking | works |
| Local LLM synthesis (OpenAI-compatible endpoint) | works, requires a running server |
| In-process embeddings and semantic search | works, model downloads on first use |
| Spaced-repetition queue and review sessions | works |
| Quiz engine (generation + semantic grading) | works |
| Tutor chat scoped to a document | works |
| English coach mode | works |
| Tests | 136 passing in 35 files |
| Multi-user / auth | **not implemented** — single local user |

## Stack

- **Next.js (App Router) + TypeScript** for the UI and the API routes under `src/app/api/`.
- **Local LLM** through any OpenAI-compatible endpoint. Default target is a `llama.cpp` server on
  `http://127.0.0.1:8080/v1` (see `.env.example`); model swapping is scripted.
- **Embeddings in-process** with `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`, quantized) — no external
  embedding service.
- **SQLite through `node:sqlite`** (`DatabaseSync`) for the local cache; requires Node ≥ 22.5.
- **Markdown as the source of truth**: notes are `gray-matter` files under `data/wiki/`, rendered with
  `marked` + KaTeX, sanitized with `dompurify`.
- **`pdf-parse`** for ingestion, **`zod`** for every LLM response schema.

## Setup

Prerequisites: Node ≥ 22.5 (for `node:sqlite`), `pnpm`, and a local LLM server speaking the OpenAI chat API.

```bash
cp .env.example .env      # point LLM_BASE_URL at your server
pnpm install
pnpm dev                  # http://localhost:3000
pnpm test                 # 136 tests
```

`scripts/switch-model.sh` starts, stops and switches the local model; `pnpm model:status` shows what is
running. `pnpm ecosystem:start` brings up the app and the model together, `pnpm ecosystem:stop` takes both
down.

## Architecture

```
src/app/            App Router pages + API routes (save, search, session, review, study, refine)
src/server/
  env.ts            environment and model selection
  db.ts             SQLite cache (node:sqlite)
  llm.ts            OpenAI-compatible client over node:http, zod-validated
  embeddings.ts     in-process feature-extraction pipeline
  wiki-store.ts     read/write Markdown notes with frontmatter
  section-synthesizer.ts  LLM pass that turns sources into wiki sections
  srs-engine.ts     spaced-repetition scheduling
  quiz-engine.ts    question generation and grading
  session-manager.ts      study session lifecycle
  ingest-job-manager.ts   background ingestion with progress
  pdf-extractor.ts  PDF to text
  english-coach.ts  conversational English practice
tests/              35 files, unit-level, vitest
scripts/            model switch, ecosystem start/stop, benchmark harnesses
data/               wiki and logs (see Data below)
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | development server |
| `pnpm build` / `pnpm start` | production build and serve |
| `pnpm test` | 136 unit tests via vitest (~6 s) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm model:list` / `model:status` / `model:switch` | manage the local LLM |
| `pnpm ecosystem:start` / `ecosystem:stop` | app + model together |
| `pnpm study:errors` | last 40 ingestion errors |

## Data

`data/wiki/` is **local only** and gitignored: it holds the notes you ingest and the sessions you run, which
are personal by nature. Only the code ships in the repository. `data/cache.db` and `data/logs/` are also
gitignored and rebuilt on demand.

Benchmark scripts read a sample PDF from `$BENCH_PDF`, falling back to `~/Downloads`; the model scripts take
`MODELS_DIR`, `LLAMA_SERVER` and `SERVICE_FILE` from the environment, with `$HOME`-based defaults.

## Known limitations

- **One user, no authentication.** The app assumes it is reachable only from your own machine.
- **A model server is mandatory.** Synthesis and quizzes fail without `LLM_BASE_URL` pointing at something
  that answers.
- **First embedding call is slow**: `@xenova/transformers` downloads the quantized MiniLM model on first use.
- **No Docker or hosting story yet.** It runs from a clone.

## License

Not declared yet — no `LICENSE` file in the repository.
