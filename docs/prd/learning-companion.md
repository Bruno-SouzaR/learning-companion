---
title: Learning Companion — Personal Learning Platform & Pedagogical Assistant
type: product
status: ready-for-planning
created_at: 2026-10-11
target_audience: internal
---

# PRD — Learning Companion

## 1. Overview & Problem Statement

Engineers and lifelong learners face two friction points in daily professional and academic development:
1. **English Communication & Prompts**: Formulating daily requests, questions, context explanations, and agent instructions in Portuguese or unpolished English slows down natural language acquisition and produces sub-optimal results from English-centric LLMs.
2. **Knowledge Fragmentation**: Academic coursework (e.g., Computer Science degree in Java, Databases) and software development insights (architectural patterns, gotchas, ADRs) frequently scatter across ephemeral chats, losing storage strength (*long-term retention*) without an active retrieval system.

Directly inserting grammar lessons into primary coding agent sessions inflates context windows, increases latency, and prompts developers to passively copy-paste without retention.

**Learning Companion** is a unified, local-first personal learning engine inspired by `ai-memory` and OMP's `teach` skill ecosystem:
- **Module 1 (English Pre-Flight & Daily Communication)**:
  - Takes raw conversational thoughts in Portuguese or informal English.
  - Generates idiomatic, natural English using an efficient LLM (configured via `.env`).
  - Breaks down grammatical errors, false cognates, and key vocabulary concisely.
  - Engages the user in **active recall**: typing the full English sentence from memory and providing an intelligent, whole-word and phrase-level diff.
  - Saves completed sentences into a structured Markdown wiki (`data/wiki/english/*.md`) with embedded vector representations.
- **Module 2 (Study Records & Knowledge Base)**:
  - Integrates with the `~/Documents/estudos/` ecosystem (Java, Database Systems, Software Architecture).
  - Maintains Markdown notes as the sole source of truth with YAML frontmatter.
  - Embeds local semantic search (`all-MiniLM-L6-v2`) in-process to connect concepts across subjects and detect recurring errors.
- **Multi-Platform Access**: Built with a responsive, touch-friendly UI for Desktop and tablet (Samsung Galaxy Tab S9) via PWA.

---

## 2. Project Context & Constraints

- **Location**: `~/projects/learning-companion`.
- **Runtime Environment**: Node.js 20+ runtime on Linux (Fedora bootc / x86_64).
- **Core Technology Stack**:
  - **Framework**: Next.js 16+ (App Router) with React 19 and TypeScript.
  - **Styling**: Tailwind CSS v4, Lucide React (icons), Slate dark-theme aesthetic (inspired by `ai-memory`).
  - **Data Storage**: Plain Markdown wiki files (`data/wiki/**/*.md`) as the primary source of truth, backed by a local SQLite cache (`data/cache.db`) using `better-sqlite3` and Drizzle ORM for fast queries.
  - **Embeddings**: In-process sentence embeddings via `@xenova/transformers` running `all-MiniLM-L6-v2` (384 dimensions) on CPU with zero data egress and zero external daemons.
  - **LLM Connectivity**: Configured strictly via `.env` (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`), supporting Groq (`llama-3.1-8b-instant`), local Ollama (`qwen2.5:7b` / `llama3.2`), or OpenAI.
- **Language Boundaries**:
  - Codebase, tests, schema, documentation, and technical identifiers: strictly English.
  - Explanations of grammatical errors and pedagogical guidance: Portuguese (for crystal-clear cognitive understanding by the user).

---

## 3. User Stories

- **US-1 (English Translation & Concise Pedagogy)**: As a user, I want to submit daily thoughts or requests in Portuguese or rough English, so that a small LLM translates them into natural English, explains mistakes concisely in Portuguese, and extracts key vocabulary.
- **US-2 (Active Recall & Word-Level Diff)**: As a language learner, I want to retype the target sentence from memory into a clean input area and see a word-by-word diff comparing my attempt to the target sentence, so that I build authentic cognitive retention.
- **US-3 (One-Click Clipboard Confirmation)**: As a developer, I want to press `Enter` or click "Copy Prompt" after validating my sentence, so that the polished English sentence is copied to my clipboard ready for use.
- **US-4 (Markdown Wiki Persistence & Frontmatter)**: As a knowledge worker, I want every completed exercise to be written as a `.md` file with YAML frontmatter containing tags, date, and error categories, so that my learning history is portable and human-readable.
- **US-5 (Local Semantic Search & Error Clustering)**: As a learner, I want to search past entries semantically using local embeddings, so that I can discover related sentences and see recurring grammar hurdles across time.
- **US-6 (Study Records Browser)**: As a student, I want to browse and review notes from university subjects (e.g., Java, Databases) alongside English entries in a unified dark-mode dashboard.

---

## 4. Non-Goals (Out of Scope for MVP)

- **NG-1 (Arcade / Character-by-Character Monkeytype Mechanics)**: No letter-by-letter game loops; real language acquisition occurs in whole words and semantic clauses.
- **NG-2 (UI-based API Key & Credential Management)**: No settings modal for API keys; all configuration is handled via `.env` for personal use.
- **NG-3 (Cloud Database & Multi-User Authentication)**: No external database servers, JWTs, or multi-tenancy; 100% local-first single-user application.
- **NG-4 (Mobile App Stores Packaging in V1)**: Native APK builds via Capacitor/React Native are deferred to post-MVP; V1 delivers responsive Web / PWA accessible on Samsung Galaxy Tab S9.

---

## 5. System Flows & Edge Cases

### Flow 1: English Pre-Flight (Prompt Refinement & Active Recall)
- **Happy Path**:
  1. User enters rough thought in the main prompt textarea and triggers `Cmd+Enter` / `Ctrl+Enter`.
  2. Next.js server route `/api/refine` calls the configured LLM with strict Zod schema formatting.
  3. LLM returns:
     - `target_english`: Natural, idiomatic English translation.
     - `mistakes_summary`: 2–3 concise bullet points in Portuguese explaining grammar/word choice.
     - `key_vocabulary`: Array of `{ term, definition }`.
     - `tags`: Error classification tags (e.g., `["preposition", "false-friend", "parentheses"]`).
  4. UI renders the feedback card and provides an active recall practice input.
  5. User types the sentence from memory and submits (`Enter`).
  6. UI performs a word-level diff, highlighting matching words in green and deviations in amber/red.
  7. User confirms: target sentence copies to clipboard, and the entry is saved to `data/wiki/english/YYYY-MM-DD-slug.md` with in-process vector embeddings generated via `all-MiniLM-L6-v2`.
- **Empty State**:
  - If input is empty, submission is disabled.
- **Error Cases**:
  - If the LLM provider times out or fails authentication, an actionable inline message displays the exact `.env` error without clearing the user's drafted text.

### Flow 2: Markdown Storage & Embeddings Indexing
- **Happy Path**:
  1. Server writes entry file to `data/wiki/english/<date>-<slug>.md` with YAML frontmatter:
     ```yaml
     ---
     id: "eng_20261011_01"
     created_at: "2026-10-11T00:30:00Z"
     tags: ["preposition", "daily-communication"]
     input_pt: "..."
     target_en: "..."
     ---
     ```
  2. Embedder generates a 384-dimensional float vector for `target_en` and `input_pt`.
  3. Metadata and vectors are indexed in `data/cache.db` (SQLite) for sub-millisecond retrieval.
- **Edge Cases**:
  - On first boot, if `cache.db` is missing, an auto-index routine scans `data/wiki/` and rebuilds the SQLite database from markdown files.

### Flow 3: Semantic Search & History Navigation
- **Happy Path**:
  1. User navigates to History / Study Records tab and types a natural query (e.g., *"remarcar reunião"*).
  2. System embeds query using `@xenova/transformers` and calculates cosine similarity against indexed vectors.
  3. Results display matching markdown entries ranked by semantic relevance alongside keyword highlights.
- **Empty State**:
  - Displays recent entries chronologically when search query is empty.

---

## 6. Acceptance Criteria (BDD)

### AC-1: Prompt Translation & Structured Pedagogy
- **Given** the user inputs `"eu estou querendo aprimorar meu ingles"` into the prompt area,
- **When** the user clicks "Refine Prompt" (or presses `Cmd+Enter`),
- **Then** the server returns `target_english: "I want to improve my English."`,
- **And** returns concise Portuguese explanations of error points and key vocabulary,
- **And** renders the Active Recall challenge card.

### AC-2: Active Recall Word-by-Word Diff
- **Given** the target sentence is `"I want to improve my English."`,
- **When** the user types `"I want improve my English."` (missing `"to"`),
- **Then** the diff algorithm identifies `"to"` as missing and highlights the divergence,
- **And** allows the user to correct the sentence before final copy.

### AC-3: Markdown Wiki & In-Process Embeddings Generation
- **Given** a successfully completed active recall exercise,
- **When** the entry is saved,
- **Then** a physical `.md` file is created in `data/wiki/english/` with valid YAML frontmatter,
- **And** an embedding vector (384 dimensions) is generated locally via `@xenova/transformers` without external network requests,
- **And** the entry is searchable via cosine similarity in SQLite `cache.db`.

---

## 7. High-Level Architecture & Tech Stack

```mermaid
graph TD
    subgraph Browser Client [Next.js App Router / React 19 / Tailwind 4]
        PWA[PWA Responsive UI: Desktop & Tab S9]
        PreFlightView[English Pre-Flight & Word Diff]
        HistoryView[Study Records & Semantic Search]
    end

    subgraph Next.js Node Server
        RefineRoute[/api/refine - LLM Proxy & Zod Validator]
        SearchRoute[/api/search - Cosine Similarity & FTS]
        MarkdownEngine[Markdown Wiki Engine: gray-matter & fs]
        LocalEmbedder[In-Process Embedder: @xenova/transformers all-MiniLM-L6-v2]
        SQLiteCache[(SQLite: data/cache.db via better-sqlite3)]
    end

    subgraph External
        LLM[LLM Provider: Groq / Ollama / OpenAI via .env]
    end

    PWA --> PreFlightView
    PWA --> HistoryView
    PreFlightView --> RefineRoute
    RefineRoute --> LLM
    RefineRoute --> MarkdownEngine
    MarkdownEngine --> LocalEmbedder
    LocalEmbedder --> SQLiteCache
    HistoryView --> SearchRoute
    SearchRoute --> SQLiteCache
```
