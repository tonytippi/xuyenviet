---
title: 'Establish the Traveler UI Foundation'
type: 'feature'
created: '2026-07-16'
status: 'in-review'
baseline_revision: '6352cf3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Traveler-facing pages lack one consistent root typography, color-token, accessibility, and icon contract. The global graph-paper canvas and feature-local icons make future workspace migrations visually inconsistent and harder to keep accessible.

**Approach:** Establish a minimal global traveler UI foundation at the app root and a data-free local typed SVG icon boundary. Leave existing route and feature behavior intact so subsequent Epic 7 stories can migrate each surface deliberately.

## Boundaries & Constraints

**Always:** Keep `html` Vietnamese, use Inter through Next's font loader, preserve strict TypeScript and the `@/*` alias, provide semantic white/stone/green/amber/teal/source tokens, visible keyboard focus, and reduced-motion support. Put stateless presentational icons only in `src/components/ui`; named icons must accept normal SVG props and default to decorative use. Maintain Vietnamese diacritic readability and do not rely on color alone for status meaning.

**Block If:** Inter cannot be loaded by the existing Next build environment and no established project-safe fallback is available; global styling changes demonstrably break an existing admin or authenticated route.

**Never:** Do not redesign the public entry, AI Ask shell, composer, answers, sidebar, mobile sheets, or inspector. Do not migrate existing feature-local icons before their owning surface's later Epic 7 story. Do not add an icon dependency, server/data access, route state, persistence, new endpoints, or an alternate visual system. Do not globally force form-control styling or override route-specific admin styling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Root render | Any public or authenticated route | Inter and `lang="vi"` apply; neutral white page base and semantic CSS tokens are available. | Existing route-specific styles continue to control their surfaces. |
| Keyboard and motion preference | Focusable control or `prefers-reduced-motion: reduce` | Focus is visibly distinguishable; nonessential transitions and animations are reduced. | Existing semantic labels remain required; color and motion are not the only status signal. |
| Shared icon use | A future traveler component imports a named icon | Stateless typed SVG accepts `className`, sizing, ARIA, and SVG props; decorative use is hidden from assistive tech by default. | Accessible name, tooltip, and 44px target remain the consuming control's responsibility. |

</intent-contract>

## Code Map

- `src/app/layout.tsx` -- Root document metadata, language, and global body markup.
- `src/app/globals.css` -- Existing global Tailwind import, palette, body canvas, and base interaction styles.
- `src/components/ui/icons.tsx` -- New canonical data-free typed SVG icon boundary.
- `tests/traveler-ui-foundation.test.ts` -- Focused contract coverage using the existing Vitest setup.
- `src/features/ai/ai-ask-composer.tsx` -- Existing feature-local icons; explicitly not migrated in this story.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/layout.tsx` -- Load Inter with `next/font/google`, preserve Vietnamese document language and metadata, and apply the font at the document root or body -- establishes application-wide typography without route markup changes.
- [x] `src/app/globals.css` -- Replace the universal graph-paper canvas with semantic foundation tokens and neutral base surfaces; add global `:focus-visible` fallback and `prefers-reduced-motion` handling -- provides reusable visual and accessibility primitives without redesigning feature screens.
- [x] `src/components/ui/icons.tsx` -- Add named, stateless typed SVG components for planned traveler needs (attachment, send, close, menu, chat/new chat, project, source, account, loading) with consistent defaults and no feature imports -- creates the sole local icon boundary for later migrations.
- [x] `tests/traveler-ui-foundation.test.ts` -- Add resilient root-style and icon-export contract tests using source inspection and static rendering -- prevents regression of the story's shared contracts without browser-only test dependencies.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move Epic 7 and Story 7.1 through implementation status only after verification/review completes -- preserves sprint tracking accuracy.

**Acceptance Criteria:**
- Given the application root renders a public or authenticated route, when global styling applies, then Inter is loaded, the document language is Vietnamese, and global CSS provides semantic white/stone/green/amber/teal/source tokens, neutral base surfaces, visible focus, and reduced-motion behavior.
- Given shared presentational UI is added, when a future feature imports it, then it resides under `src/components/ui` and has no feature, database, server-action, or route-state dependency.
- Given a migrated traveler surface later needs a product icon, when it uses the shared boundary, then it can import a named typed SVG icon with caller-provided SVG/ARIA props and no competing icon system.
- Given Vietnamese text is viewed at mobile widths or 200% zoom, when global styles apply, then the foundation preserves readable line sizing and does not make color or motion the only communication channel.

## Spec Change Log

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (high 0, medium 0, low 2)
- defer: 0
- reject: 0
- addressed_findings:
  - [low] [patch] Added `latin-ext` to the Inter subset list so the root font configuration explicitly covers Vietnamese extended glyphs.
  - [low] [patch] Recorded completed implementation tasks and synchronized the sprint tracker with the story review state.

## Auto Run Result

**Summary:** Established the shared traveler UI foundation: Inter with Vietnamese extended glyph coverage, neutral semantic global surfaces, visible focus and reduced-motion defaults, and a typed data-free local SVG icon boundary.

**Files changed:**
- `src/app/layout.tsx` -- Loads and applies Inter while retaining Vietnamese document language.
- `src/app/globals.css` -- Defines shared semantic tokens and global accessibility-safe base styling.
- `src/components/ui/icons.tsx` -- Provides the named typed SVG icon contract for later traveler-surface migrations.
- `tests/traveler-ui-foundation.test.ts` -- Covers root setup, CSS contracts, and icon rendering/prop behavior.
- `_bmad-output/implementation-artifacts/epic-7-context.md` -- Records compiled Epic 7 planning context.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marks Epic 7 in progress and Story 7.1 complete.

**Review:** Two automated review layers found no code defects. Two low-risk workflow-record findings were corrected: Vietnamese extended glyph coverage was made explicit with `latin-ext`, and story task/sprint tracking was synchronized. No items were deferred.

**Verification:** `pnpm exec vitest run tests/traveler-ui-foundation.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The focused test run applies existing Drizzle migrations to the configured test database.

**Residual risks:** Existing traveler surfaces retain their local icon implementations until their dedicated Epic 7 migration stories. Manual cross-route zoom and reduced-motion browser checks were not automated.

## Design Notes

The token contract is intentionally additive and semantically named. Existing arbitrary Tailwind colors and feature-local icons remain until their respective surfaces migrate; a broad replacement here would couple this foundation to Stories 7.2 through 7.7 and risk unrelated admin regressions.

## Verification

**Commands:**
- `pnpm test:run -- tests/traveler-ui-foundation.test.ts` -- expected: focused foundation contracts pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds with the configured Inter font.

**Manual checks:**
- Inspect `/`, `/sign-in`, `/ai-ask`, and an admin route at normal and 200% zoom: Inter is applied, Vietnamese labels remain readable, the global graph-paper canvas is absent, and route-specific styling remains intact.
- Navigate keyboard-only and emulate reduced motion: focus is visible and nonessential animations/transitions are substantially reduced.
