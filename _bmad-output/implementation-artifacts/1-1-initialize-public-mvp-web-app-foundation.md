# Story 1.1: Initialize Public MVP Web App Foundation

Status: ready-for-dev

<!-- Note: Validation is optional. Run bmad-create-story with validate action for quality check before dev-story. -->

## Story

As a product team,
I want a Next.js TypeScript app foundation with database/migration wiring,
so that authenticated AI Ask and future protected features can be implemented consistently inside the modular monolith.

## Acceptance Criteria

1. Given the repository has no application foundation, when the app foundation is created, then the project uses Next.js App Router with TypeScript and a clear feature/module folder structure, and Drizzle is configured for PostgreSQL migrations without creating unrelated domain tables.
2. Given the app runs locally, when a user opens the root route, then a public entry page loads successfully, and required environment variables are documented with safe placeholders.
3. Given future features need server-side mutations, when shared server utilities are added, then they support authenticated server-side entrypoints without exposing client-side write paths.

## Tasks / Subtasks

- [ ] Create the Next.js application foundation in the repository root. (AC: 1, 2)
  - [ ] Use Next.js App Router, TypeScript, Tailwind CSS, ESLint, and a `src/` directory unless an existing generated default makes this unsafe.
  - [ ] Keep the app in this repository root; do not create a nested application folder that would make future story paths ambiguous.
  - [ ] Preserve existing repository docs/config: do not overwrite `README.md`, `AGENTS.md`, `.gitignore`, `_bmad-output/`, or BMad metadata when scaffolding. If a generator wants to replace these, merge manually instead.
  - [ ] Configure `@/*` import alias to resolve to `src/*`.
  - [ ] Ensure `src/app/layout.tsx` and `src/app/page.tsx` exist and the root route renders.
- [ ] Establish feature/module folder structure for the modular monolith. (AC: 1, 3)
  - [ ] Create `src/features/` with placeholder module boundaries only where useful: `auth`, `chat-trips`, `admin`, `knowledge`, `retrieval`, `search`, `ai`, `usage`, `referrals`, `audit`, `feedback`.
  - [ ] Add a short module-boundary README or comments if placeholders are created; avoid adding domain implementation tables or fake services in this story.
  - [ ] Create shared server utility location, e.g. `src/server/` or `src/lib/server/`, that is explicitly server-only.
- [ ] Configure Drizzle for PostgreSQL migrations without introducing unrelated domain tables. (AC: 1)
  - [ ] Add Drizzle dependencies and config for PostgreSQL.
  - [ ] Add `drizzle.config.ts` pointing at schema and migrations output.
  - [ ] Add a minimal schema entry point such as `src/db/schema.ts` with no business/domain tables yet, or only migration-safe scaffolding required by Drizzle.
  - [ ] Add package scripts for generating and running migrations, but do not require a live database for normal typecheck/lint.
- [ ] Implement a public root entry page. (AC: 2)
  - [ ] Root route `/` loads without authentication.
  - [ ] Page copy is Vietnamese-first or clearly prepared for Vietnamese-first MVP.
  - [ ] Page communicates XuyenViet as an AI road-trip planning companion and includes a non-functional sign-in/AI Ask CTA placeholder if auth is not implemented yet.
  - [ ] Follow the UX design direction: responsive web, map-paper utility feel, restrained route green/amber tokens, no booking/payment/reward UI.
- [ ] Document required environment variables with safe placeholders. (AC: 2)
  - [ ] Add `.env.example` with safe placeholder values only; never commit real secrets.
  - [ ] Include at minimum `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, and environment marker if used.
  - [ ] Document local setup in `README.md` or a dedicated setup doc without overwriting the product overview.
- [ ] Add server-only utility guardrails for future authenticated mutations. (AC: 3)
  - [ ] Create a server-only module for future auth/session entrypoint stubs, e.g. `src/server/auth.ts`, using `server-only` or equivalent import guard.
  - [ ] Create a server-only mutation helper or documented pattern that future stories can extend; it must not expose client-side writes.
  - [ ] Do not implement Google OAuth, roles, admin authorization, audit events, chat persistence, or AI provider calls in this story; those belong to later stories.
- [ ] Add baseline verification scripts and run them. (AC: 1, 2, 3)
  - [ ] Ensure `npm run lint` or equivalent exists and passes.
  - [ ] Ensure `npm run typecheck` or equivalent exists and passes.
  - [ ] Ensure `npm run build` passes, or record the exact blocker if environment/dependency setup prevents it.

## Dev Notes

### Current Repository State

- The repository currently contains planning/BMad artifacts, `README.md`, `AGENTS.md`, and no application foundation files such as `package.json`, `src/`, `app/`, `next.config.*`, `tsconfig.json`, or Drizzle config.
- Existing `.gitignore` ignores `_bmad/`, `.agents/`, `.opencode/`, and `opencode.jsonc` only. The implementation must add normal Node/Next ignore entries such as `node_modules/`, `.next/`, `.env*` with `.env.example` explicitly allowed.
- There are no existing app files to preserve or update. This story is expected to create new app foundation files.
- If using `create-next-app`, run it in a temporary directory or use a non-destructive/manual setup approach, then copy/merge generated app files into the repository root. Do not let the generator replace existing `README.md`, `AGENTS.md`, or BMad artifacts.

### Source Requirements

- Epic 1 objective: public entry, public Google sign-in later, AI Ask auth gate later, operator/admin role-protected access later, audited protected mutations later, and baseline production-ready app/data foundation. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 1: Public Sign-In And App Foundation`]
- Story 1.1 acceptance criteria require Next.js App Router, TypeScript, clear feature/module folder structure, Drizzle PostgreSQL migrations, root route load, safe env docs, and server utilities for authenticated server-side entrypoints. [Source: `_bmad-output/planning-artifacts/epics.md#Story 1.1: Initialize Public MVP Web App Foundation`]
- PRD says initial product is public-access MVP for Vietnamese-speaking road-trip travelers; primary surface is AI Ask, but this story only needs the public entry foundation. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#1. Summary`]
- PRD non-goals exclude mobile app, booking, payments, credit wallets, reward balances, referral payout, affiliate automation, and Google Maps integration for first cut. Do not add UI or routes implying those features exist. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#3. Non-Goals`]

### Architecture Requirements

- Runtime must be a Next.js modular monolith: UI, route handlers, server actions, admin, chat, retrieval orchestration, and operations live in one TypeScript app. Do not split services for MVP. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1: MVP Runtime Is A Next.js Modular Monolith`]
- Use feature modules with server-side interfaces. UI components call feature server entrypoints; feature modules must not directly mutate another module's aggregate. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5: Feature Ownership Boundaries Are Explicit`]
- PostgreSQL owns product and retrieval state. Drizzle owns schema and migrations. All persistent tables and indexes must be introduced through migrations. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-2: PostgreSQL Owns Product State And Retrieval State`; `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3: Drizzle Owns Schema And Migrations`]
- Mutations must be server-side. Later stories will add audit records; this story should establish a server-only pattern but not fake audit persistence. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited`]
- Public entry/sign-in routes may be public; AI Ask and authenticated personalization later require Google OAuth; admin/operator later requires OAuth plus role checks. Do not implement client-only authorization. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4: Auth Is Public Sign-In Plus Google OAuth And Server-Side Roles`]
- Environments and secrets must stay separate. Local/dev bypasses must not become deployable production defaults. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-14: Environments And Secrets Stay Separate`]
- Deployment target should remain serverless-friendly and provider-adapted. Avoid code that assumes unmanaged local infrastructure. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-15: Deployment Seed Is Serverless-Friendly, Provider Not Yet Final`]

### UX Requirements

- UX foundation assumes responsive web, Next.js App Router, React, shadcn/ui, Tailwind, and PostgreSQL-backed auth/session data. If the implementation chooses not to use shadcn/ui, note this explicitly for story validation because UX lists it as an open contract point. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Foundation`; `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Open Questions`]
- Public entry surface purpose: explain value, show Google sign-in path, preserve future referral parameter silently. In this story, auth/referral may be placeholders only. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Information Architecture`]
- Visual design direction: map-paper utility, route green primary, guide amber accent, readable Vietnamese text, responsive layout, no generic travel gradients, no map-first UX. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Brand & Style`; `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Colors`; `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Inspiration & Anti-patterns`]
- Accessibility floor: WCAG 2.2 AA target, keyboard reachability, visible labels not color-only, Vietnamese diacritics legible at 200% zoom and mobile widths. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Accessibility Floor`]

### Recommended Technical Setup

- Use current Next.js App Router scaffolding. Current docs show `create-next-app@latest` recommended defaults include TypeScript, ESLint, Tailwind CSS, App Router, Turbopack, and `@/*` import alias; minimum Node.js is 20.9. [Source: Next.js installation docs fetched 2026-07-05]
- Use a `src/` directory because it keeps app code separate from repository config and BMad/planning artifacts. Next.js docs support `--src-dir`, with `src/app` and `@/*` pointing to `./src/*`. [Source: Next.js installation docs fetched 2026-07-05]
- Use shadcn/ui only as foundation setup and base components needed by the public entry page. Current shadcn docs support `pnpm dlx shadcn@latest init` in an existing Next.js project and then `pnpm dlx shadcn@latest add button card` as needed. [Source: shadcn Next.js installation docs fetched 2026-07-05]
- Drizzle PostgreSQL current docs support `drizzle-orm` with either `pg`/`node-postgres` or `postgres`/postgres.js, plus `drizzle-kit`. Prefer the simplest serverless-friendly choice compatible with the selected hosted Postgres provider; do not hard-code provider-specific behavior in this story. [Source: Drizzle PostgreSQL docs fetched 2026-07-05]
- Auth.js current Next.js setup uses `next-auth@beta`, `auth.ts`, and `app/api/auth/[...nextauth]/route.ts`, but this story should not fully implement Auth.js Google OAuth. Story 1.3 owns that. This story may reserve env names and server-only stubs only. [Source: Auth.js installation docs fetched 2026-07-05]
- Use one package manager consistently. Prefer `pnpm` if the dev environment has it; otherwise use `npm`. The selected package manager must produce the matching lockfile and scripts, and the dev agent must record the choice in completion notes.
- If manually installing instead of using a generator, install the foundation packages directly (`next`, `react`, `react-dom`, TypeScript/ESLint/Tailwind tooling, Drizzle packages, and `server-only`) and create the required config files explicitly.

### Project Structure Requirements

Recommended root-level foundation after implementation:

```text
.
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── ui/                  # shadcn components if initialized
│   ├── db/
│   │   └── schema.ts            # schema entrypoint, no unrelated domain tables in Story 1.1
│   ├── features/
│   │   ├── auth/
│   │   ├── chat-trips/
│   │   ├── admin/
│   │   ├── knowledge/
│   │   ├── retrieval/
│   │   ├── search/
│   │   ├── ai/
│   │   ├── usage/
│   │   ├── referrals/
│   │   ├── audit/
│   │   └── feedback/
│   ├── lib/
│   └── server/                  # server-only helpers and future mutation/auth patterns
├── drizzle/
│   └── migrations/              # generated migrations when schemas exist
├── drizzle.config.ts
├── components.json              # if shadcn initialized
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.*
├── eslint.config.*
├── .env.example
└── README.md
```

If `create-next-app` or shadcn generates a different but conventional file name, keep the generated convention and document it in completion notes.

### Scope Boundaries

- Do not create Auth.js OAuth routes beyond harmless placeholders/stubs; Story 1.3 owns real Google Login.
- Do not create users/accounts/sessions/roles tables yet unless required by a chosen Auth.js adapter setup in a later story. Story 1.1 only configures Drizzle migrations.
- Do not create chat, trip, knowledge, retrieval, provenance, usage, referral, feedback, or audit domain tables in this story.
- Do not call OpenAI, Tavily, or any AI/search provider.
- Do not implement protected AI Ask, admin authorization, referral attribution, audit trail, or data deletion behavior; preserve clear module boundaries for later stories.
- Do not add booking, payments, rewards, credits, maps, affiliate, or partner transaction UI.

### Testing Requirements

- Add and run baseline checks appropriate for the created app: lint, typecheck, and production build.
- Root route must be manually or automatically verifiable by running the local dev server and opening `/`, or by passing `next build` if browser verification is not feasible.
- Drizzle config should be import/typecheck-safe without requiring real secrets. Migration generation may require a placeholder `DATABASE_URL`; document command behavior clearly.
- Any server-only helpers must not be importable from client components. Use `import 'server-only'` where applicable.
- Verify existing project documentation still exists after scaffolding: `README.md`, `AGENTS.md`, and BMad output files must remain intact.

### Previous Story Intelligence

- No previous story exists in Epic 1. This is the first implementation story and establishes conventions for later stories.

### Git Intelligence Summary

- Recent commits are planning artifacts only: readiness, epics/stories, architecture, PRD, docs. No application code conventions exist yet.
- Current untracked implementation files are BMad artifacts created during this session. Do not delete or overwrite them.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 1.1: Initialize Public MVP Web App Foundation`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#1. Summary`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#3. Non-Goals`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1: MVP Runtime Is A Next.js Modular Monolith`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3: Drizzle Owns Schema And Migrations`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5: Feature Ownership Boundaries Are Explicit`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

## Dev Agent Record

### Agent Model Used

TBD by dev agent.

### Debug Log References

### Completion Notes List

- Story created by BMad create-story workflow.
- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- `_bmad-output/implementation-artifacts/1-1-initialize-public-mvp-web-app-foundation.md`
