---
project_name: xuyenviet
user_name: Tony
date: 2026-07-06
sections_completed:
  - technology_stack
  - language_specific_rules
  - framework_specific_rules
  - testing_rules
  - code_quality_style_rules
  - development_workflow_rules
  - critical_dont_miss_rules
existing_patterns_found: 12
status: complete
rule_count: 49
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Package manager: pnpm 10.26.2. Use pnpm scripts and keep `pnpm-lock.yaml` authoritative.
- Runtime/app: Next.js 15.3.5 App Router in a root-level `src/` project.
- UI: React 19.1.0 and React DOM 19.1.0.
- Language: TypeScript 5.8.3 with `strict: true`, `allowJs: false`, `moduleResolution: "bundler"`, and `@/* -> ./src/*`.
- Styling: Tailwind CSS 4.1.11 through `@tailwindcss/postcss`; global tokens live in `src/app/globals.css`.
- Linting: ESLint 9.30.1 flat config, extending `next/core-web-vitals` and `next/typescript`.
- Data: PostgreSQL is the owned product/retrieval data plane; Drizzle ORM 0.44.5 and Drizzle Kit 0.31.4 own schema and migrations.
- DB driver: `@neondatabase/serverless` 1.0.2 is installed; keep provider-specific behavior behind config/adapters until hosting is final.
- Server boundaries: use `server-only` 0.0.1 for server-only auth, mutation, data, AI, retrieval, and admin helpers.
- Quality scripts: `pnpm lint`, `pnpm typecheck`, and `pnpm build` are the baseline checks.

## Critical Implementation Rules

### Language-Specific Rules

- Keep TypeScript strict-safe. Do not add `any`, JS files, or unchecked casts unless the story explicitly justifies them.
- Use `@/*` imports for app code under `src/*`; keep relative imports only for same-folder or close sibling modules.
- Keep server-only code isolated. Files that read sessions, secrets, databases, AI/search providers, or protected state must import `server-only`.
- Do not introduce domain tables, fake services, or placeholder persistence outside the current story scope. Story 1.1 intentionally left `src/db/schema.ts` empty.
- Drizzle commands must fail closed when `DATABASE_URL` is missing. Do not restore localhost fallback behavior.
- Prefer explicit exported functions/types from feature/server modules. Do not export generic cross-module table upsert/delete helpers.
- Throw safe operational errors from server helpers; do not expose secrets, provider payloads, OAuth internals, or raw source material in user-facing errors.

### Framework-Specific Rules

- Use Next.js App Router conventions under `src/app/`. Prefer server components by default; add `"use client"` only when browser interactivity requires it.
- Public routes may render without auth, but AI Ask and admin/operator routes/actions must resolve auth server-side before reading or mutating protected data.
- UI and route handlers should call feature-owned server entrypoints, not mutate another module's aggregate directly.
- Keep the MVP as one Next.js modular monolith. Do not split chat, admin, retrieval, auth, or AI orchestration into separate services.
- Preserve Vietnamese-first UX. User-facing copy should use Vietnamese diacritics, `html lang="vi"`, and readable mobile/desktop layouts.
- Preserve current visual direction unless a UX story changes it: map-paper utility feel, route green, guide amber, no generic travel gradients, no map-first UI.
- Do not add booking, payments, rewards, credits, Google Maps, affiliate, partner transaction, or referral reward UI. These are PRD non-goals for MVP.
- For React, avoid unnecessary `useMemo`/`useCallback`; keep components simple unless the codebase establishes a stronger client-side state pattern later.

### Testing Rules

- Current baseline checks are `pnpm lint`, `pnpm typecheck`, and `pnpm build`; run relevant checks after code changes and record blockers exactly.
- No unit or E2E framework exists yet. Do not invent a test stack casually; add one only when a story requires it or architecture is updated.
- For auth, protected routes, mutations, retrieval, AI usage, deletion, and admin workflows, prefer server-side tests when a test stack is introduced; client-only checks are not enough.
- Any story that adds persistent tables must verify Drizzle schema/migration behavior and must not require a live database for ordinary lint/typecheck/build.
- Any story that stores chat/project-derived retrievable content must define and verify deletion behavior for owner chat/project deletion.
- Any AI/search implementation must verify failure states, provenance/usage recording, and no provider call when auth or validation fails.

### Code Quality & Style Rules

- Keep app code under `src/`; keep BMad artifacts under `_bmad-output/` and do not move planning/implementation documents into app folders.
- Use feature folders as ownership boundaries: `auth`, `chat-trips`, `admin`, `knowledge`, `retrieval`, `search`, `ai`, `usage`, `referrals`, `audit`, and `feedback`.
- Add code in the owning feature/module first. Shared helpers belong in `src/server/` only when they are truly cross-cutting and server-only.
- Keep comments rare and useful. Explain architectural or security constraints, not obvious assignments.
- Keep public copy Vietnamese-first. Do not strip diacritics.
- Preserve accessibility basics: keyboard focus, readable contrast, visible labels, mobile widths, and no color-only status communication.
- Prefer small, explicit files and functions over premature abstraction. Do not add compatibility layers unless there is a concrete external or persisted-data need.
- Use existing scripts and config names. Avoid introducing parallel build/lint/typecheck commands without a story-level reason.

### Development Workflow Rules

- Follow BMad story flow for implementation: create story, validate when useful, dev story, code review, then update sprint status.
- Story files live in `_bmad-output/implementation-artifacts/`; planning artifacts live in `_bmad-output/planning-artifacts/`.
- Before implementing a story, read the story file plus relevant PRD, architecture, UX, and epics references cited in the story.
- Update story task checkboxes, Dev Agent Record, completion notes, change log, and file list when implementing through BMad story workflow.
- Keep `sprint-status.yaml` aligned with story progress: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`.
- Do not overwrite `README.md`, `AGENTS.md`, `_bmad-output/`, `_bmad/`, or installed skill metadata while scaffolding or refactoring.
- Baseline verification for implementation is `pnpm lint`, `pnpm typecheck`, and `pnpm build` unless the story adds more specific checks.
- If verification cannot run, record the exact command, failure, and blocker in the story completion notes.

### Critical Don't-Miss Rules

- Do not implement Google OAuth before the Auth.js story owns it. Story 1.2 may gate routes and present sign-in entry, but Story 1.3 owns real Google Login.
- Do not make AI calls for unauthenticated users, invalid submissions, or blocked routes. No conversation, context, retrieval, usage, or provider call should be created in those paths.
- Do not treat web search, Facebook, copied posts, or image-derived facts as approved knowledge. They remain unverified until operator approval.
- Do not expose `raw_source_material`, operator-only notes, provider payloads, secrets, or admin controls to normal travelers.
- Do not render source/confidence UI from parsed answer text. Source/confidence must come from stored provenance once that feature exists.
- Do not stream user-visible AI answers before retrieval/search context and provenance ledger inputs are assembled.
- Do not use external vector stores as hidden source of truth. Embeddings must link back to current PostgreSQL owner rows and respect owner status/deletion.
- Do not create reward, credit, payout, ranking, or balance behavior for referrals or usage. MVP only captures referral attribution and AI usage metadata.
- Any new table containing chat/project-derived retrievable content must define deletion behavior before migration approval.
- Production-facing code must not accept placeholder secrets or local bypasses as deployable defaults.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Follow all rules exactly as documented.
- When in doubt, prefer the more restrictive option.
- Update this file if new implementation patterns become project standards.

**For Humans:**

- Keep this file lean and focused on agent needs.
- Update when technology stack, architecture, or workflow rules change.
- Review periodically for outdated rules.
- Remove rules that become obvious or no longer prevent likely mistakes.

Last Updated: 2026-07-06
