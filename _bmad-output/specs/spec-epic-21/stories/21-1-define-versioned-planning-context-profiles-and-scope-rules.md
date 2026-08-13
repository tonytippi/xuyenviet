---
title: 'Define Versioned Planning Context Profiles And Scope Rules'
type: 'feature'
created: '2026-08-13'
status: 'done'
baseline_revision: 'f160969630523c63a61b8f5f36c2e2e71f1a9b34'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Lớp Retrieval chưa có hợp đồng versioned để xác định dữ liệu ngữ cảnh nào là trọng yếu cho từng deliverable và chưa có cách xác thực đồ thị scope trước khi bất kỳ clarification state nào được lưu ở các story sau.

**Approach:** Bổ sung shapes/parsers browser-safe và một Retrieval-owned catalog/evaluator thuần, cùng các bản ghi version tái sử dụng và migration forward. Mọi identity, scope relation, completeness, và precedence phải được xác định từ dữ liệu typed đã xác thực.

## Boundaries & Constraints

**Always:** Dùng các semantics và discriminator tại Story 21.1 trong `story-contracts.md` làm handoff chính xác; contracts chỉ chứa shape/parser browser-safe exact-key; Retrieval là owner duy nhất của catalog bất biến, resolver, graph validator, comparator và completeness evaluator; pin đầy đủ version; tạo identity ổn định bằng canonical ordering/digest; reject toàn bộ proposal invalid trước khi có kết quả persistence; run test integration tuần tự và tự gọi `resetTestDatabase()`.

**Block If:** Hợp đồng chính xác không thể biểu diễn bằng architecture contract hoặc codebase hiện có mà không phải chọn một hành vi quan sát được khác nhau; migration/test database không khả dụng thì ghi nguyên văn blocker trong spec, không nới fixture hay assertion.

**Never:** Không thêm session, answer claim, scoped value, evidence, extraction/plan attempt, `contentRevision`, message ordinal, global traveler profile, service/queue/worker/config mới; không để prompt prose, model confidence, undeclared key, input ordering, timestamp hay latest-write-wins quyết định readiness/value precedence; không dùng `source-bundle.ts` làm owner cho clarification state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Validated mixed plan | Deliverables và scope graph hợp lệ, có version | Mỗi instance nhận profile immutable, scope ref và validation digest đã pin | Không persistence session/value trong story này |
| Invalid graph | Cycle, node duplicate/orphan, ref sai hoặc vượt cap | Resolver từ chối toàn bộ proposal | Không trả graph/plan partial |
| Scoped preference | Stay Đà Nẵng nicer và transit sleep-only | Chỉ strict ancestry hoặc rule precedence tương thích áp dụng giá trị | Overlap không so sánh được là `ambiguous` |
| Retry equivalent plan | Cùng semantic graph/deliverables khác thứ tự input | Graph identity và deliverable coalescing không đổi | Không nhân bản instance |

</intent-contract>

## Code Map

- `_bmad-output/specs/spec-epic-21/story-contracts.md:5-65` -- handoff chuẩn cho AC, task, verification và giới hạn scope của Story 21.1.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md:16-139` -- shapes/discriminators/version pin canonical phải tương thích.
- `packages/contracts/src/index.ts:1-3,63-82` -- barrel export và exact-key parser patterns cho contract browser-safe.
- `packages/contracts/src/youtube-discovery/index.ts:40-74` -- tiền lệ module contract độc lập với record/exact key validation.
- `tests/contracts-browser-compatibility.test.ts:8-14` -- contracts không được cần Node runtime hay database.
- `packages/database/src/index.ts:18-66` -- explicit feature exports; thêm export feature mới tại đây.
- `packages/database/src/schema.ts:993-1032,1118-1181` -- Drizzle table/check/FK/version convention và bằng chứng các row conversation là scope Story 21.2, không sửa.
- `packages/database/src/trip-recommendations.ts:19` và `packages/database/src/ai-ask-commands.ts:89-102,329-330` -- canonical JSON SHA-256 digest pattern để identity deterministic.
- `drizzle/migrations/0066_discovery_candidate_jobs.sql` và `drizzle/migrations/meta/_journal.json:69-71` -- `0067_add_planning_context_profiles.sql` là migration forward tiếp theo.
- `vitest.config.ts:6-49,78-99` -- add unit test mới vào allowlist; integration serial, không parallel.
- `tests/helpers/db.ts:16-32` -- integration test tự reset database.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/planning-context.ts` -- định nghĩa closed browser-safe planning context types, exact-key parsers, scope/version references và validation input/output contracts -- dùng chung giữa các story mà không đưa Retrieval semantics vào contracts.
- `packages/contracts/src/index.ts` -- export explicit `planning-context` feature -- cung cấp một public shared contract boundary.
- `packages/database/src/planning-context-profiles.ts` -- xây immutable profile/policy/value-schema catalog, profile resolver, plan-policy/graph validator, canonical graph identity và deliverable coalescing, scope comparator, precedence/ambiguity và pure completeness evaluator -- Retrieval độc quyền thực thi semantic hợp đồng.
- `packages/database/src/index.ts` -- export explicit planning-context-profiles feature -- consumers dùng đúng Retrieval owner.
- `packages/database/src/schema.ts` -- thêm duy nhất reusable version-record tables/row exports cho profile, policy và value schema -- không tạo state theo conversation hay traveler.
- `drizzle/migrations/0067_add_planning_context_profiles.sql` -- migration forward tạo các record tables/ràng buộc version cần thiết -- không backfill hay suy luận dữ liệu lịch sử.
- `tests/fixtures/planning-context-v6.ts` -- thêm canonical executable inputs CLAR-01, CLAR-07, CLAR-08, CLAR-13, CLAR-21, CLAR-22, CLAR-23 -- fixture duy trì regression contract FR-5/RTA-11/RTA-12.
- `tests/planning-context-profiles.test.ts` -- DB-free coverage parser, resolver, deterministic identity/coalescing, graph caps/rejection, comparator, precedence/ambiguity và completeness -- chứng minh AC không phụ thuộc PostgreSQL.
- `vitest.config.ts` -- add test unit mới vào `unitTests` -- lệnh unit chạy trong project đúng và không đụng database.
- `tests/planning-context-profiles.integration.test.ts` -- serial schema/migration/version record coverage với `resetTestDatabase()` local setup -- kiểm chứng persistence-only scope của story.

**Acceptance Criteria:**
- Given một request itinerary, route comparison, accommodation, food, activity hoặc mixed deliverables, when Retrieval resolve profile, then từng deliverable instance có profile immutable typed với materiality, conditional applicability, scopes, validation, precedence, completeness và safe-assumption policy đã pin; readiness không suy từ prose/confidence/global completeness/key chưa khai báo.
- Given scope graph journey/day-range/leg/place/stay/meal/activity/group/deliverable, when validator xử lý graph, then comparator versioned trả deterministic `equal`, `ancestor`, `descendant`, `overlap`, `sibling` hoặc `unrelated`; cycles, duplicate, orphan, invalid ref và mọi policy cap bị reject không partial persistence.
- Given preference stay Đà Nẵng nicer và transit sleep-only, when effective values được đánh giá, then chỉ strict ancestry hoặc explicit compatible precedence áp dụng trong subtree; incomparable overlap trả ambiguity, không latest-write-wins hay leakage xuyên journey.
- Given profile, policy, comparator hoặc value schema thay đổi, when plan/fixture/evaluation được tạo, then pin exact versions; CLAR-01, CLAR-07, CLAR-08, CLAR-13, CLAR-21, CLAR-22 và CLAR-23 executable canonical cases.

## Design Notes

Canonicalization phải sắp xếp node, parent reference và deliverable theo representation ổn định trước digest. Quan hệ `overlap` là dữ kiện hình học/scope, không chứng minh precedence: nếu rule explicit không chọn một value tương thích duy nhất, evaluator giữ `ambiguous`.

## Verification

**Commands:**
- `pnpm test:unit -- tests/planning-context-profiles.test.ts` -- expected: DB-free resolver/identity/comparator tests pass.
- `pnpm test:integration -- tests/planning-context-profiles.integration.test.ts` -- expected: serial migration/schema persistence tests pass, hoặc exact environmental blocker được ghi lại.
- `pnpm db:generate` -- expected: Drizzle schema generation succeeds với `DATABASE_URL` hợp lệ.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `git diff --check` -- expected: no whitespace errors.

## Spec Change Log

### 2026-08-13 — Review repair
- Finding: immutable profiles, value validation, ancestor completeness, deterministic pins, bounds, and durable record immutability were incomplete.
- Amendment: clarified the executable implementation tasks through review repair while preserving the Story 21.1 boundary; the implementation now validates and pins these semantics without creating clarification state.
- Avoids: mutable profile behavior, invalid values affecting readiness, scope leakage, and rewritable pinned records.
- KEEP: browser-safe contracts, Retrieval ownership, and no conversation-bound persistence.

## Review Triage Log

### 2026-08-13 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 17 (high 12, medium 5)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Deep-froze profiles and validated typed values, schema pins, scope applicability, and policy bounds.
  - `[high] [patch]` Made graph and validated-plan identity canonical and version-sensitive; hardened direct graph validation and empty-plan rejection.
  - `[high] [patch]` Added database-level immutable catalog records, catalog seeds, and corresponding integration assertions.
  - `[medium] [patch]` Expanded canonical fixture and matrix coverage for retry identity, scoped stays, inheritance, ambiguity, and boundary rejection.

## Auto Run Result

Summary: Đã triển khai nền tảng versioned planning-context của Story 21.1: contracts browser-safe, Retrieval catalog/evaluator bất biến, validator/comparator scope deterministic, records migration-only và fixtures/tests canonical.

Files changed:
- `packages/contracts/src/planning-context.ts` — closed browser-safe planning context contracts and parsers.
- `packages/database/src/planning-context-profiles.ts` — immutable catalog, validation, comparison, completeness, canonical identity, and durable catalog records.
- `packages/database/src/schema.ts` and `drizzle/migrations/0067_add_planning_context_profiles.sql` — reusable immutable version records and forward migration.
- `tests/fixtures/planning-context-v6.ts`, planning-context unit/integration tests, and `vitest.config.ts` — canonical cases and test registration.
- Barrel exports, Drizzle journal, and this story spec — feature exposure, migration registration, and execution evidence.

Review findings: 17 patches applied (12 high, 5 medium); 0 deferred; 0 rejected. Follow-up review recommendation: false (score 0 after final repaired pass).

Verification:
- `pnpm test:unit -- tests/planning-context-profiles.test.ts` — passed: 42 files, 348 tests.
- `pnpm typecheck` — passed across all workspace packages.
- `git diff --check` — passed.
- `pnpm db:generate` — blocked: `Interactive prompts require a TTY terminal`.
- `pnpm test:integration -- tests/planning-context-profiles.integration.test.ts` — the integration project selected all 62 repository integration files; 53 files passed, 9 pre-existing unrelated files failed (20 tests). Story 21.1's new integration test was not among the failures.

Residual risks: Drizzle generation requires an interactive TTY in this environment. The repository integration selector cannot isolate the requested test file and currently has unrelated failing tests; the Story 21.1 integration test migrated and executed without appearing in the failures.
