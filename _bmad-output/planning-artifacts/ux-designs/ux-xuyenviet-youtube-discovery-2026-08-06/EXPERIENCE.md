---
name: XuyenViet YouTube Discovery Control Tower
status: final
project: xuyenviet
created: 2026-08-06
updated: 2026-08-17
sources:
  - ../ux-xuyenviet-2026-07-05/DESIGN.md
  - ../ux-xuyenviet-2026-07-05/EXPERIENCE.md
  - ../../architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md
  - ../../../docs/proposals/ai-first-youtube-discovery.md
---

# XuyenViet YouTube Discovery Control Tower - Experience Spine

## Foundation

Desktop-first, role-protected admin web surface for Discovery operations. It inherits the existing admin shell, XuyenViet design language, and `{components.*}` tokens from `DESIGN.md`. This document governs operator behavior; the architecture spine remains authoritative for Discovery ownership, Worker execution, safe persistence, Knowledge intake handoff, and manual-only `youtube:capture`.

Only authorized operators access this surface. Discovery produces and manages URL candidates for an actual audience that is primarily Vietnamese people planning domestic road trips; content merely being about Vietnam is not sufficient fit. It never exposes raw source material or capture internals. `Accept` calls the existing Knowledge intake API with the canonical URL. A successful accept means a URL entered Knowledge intake or was already present; it does not mean Gemini capture, evidence, cards, or publication occurred.

## Information Architecture

| Surface | Reached from | Purpose |
| --- | --- | --- |
| Discovery action queue | Admin navigation / Discovery entry | Default worklist for candidates needing review, stalled high-priority Mission needs, and persistent Discovery failures. |
| Candidate review workspace | Candidate item / Mission candidate list | Vietnamese-first ranked queue plus selected inspector for one-at-a-time Accept, defer, or skip decisions. A bounded foreign fallback section remains separate. |
| Knowledge Mission | Discovery navigation / action-queue drill-in | Inspect coverage by current province/city with legacy-name references, ask AI for bounded query suggestions, and use the existing Queries, Candidates, and Discovery funnel views. |
| Coverage need detail | Mission coverage view / action queue | Inspect topic counts and freshness under the current administrative unit, find contributions by current or legacy name, and drill into linked proposals and candidates. Card count is context, not an automatic sufficiency verdict. |
| Query proposal detail | Mission query list | Inspect reason/history; accept, edit, or dismiss an AI suggestion; create an operator query; run it immediately; and inspect safe current/latest run progress. |
| Automation Health | Discovery navigation / incident drill-in | See schedule/enabled state, throughput/review backlog, incidents, usage telemetry, data freshness, affected safe records, and new-policy quality distributions. |
| Discovery settings | Health header / authorized settings entry | Immediate global Discovery switch and policy-projected operational context. Complex policy configuration may remain a later desktop surface. |
| Knowledge intake handoff feedback | Candidate inspector after Accept | Confirm the existing Knowledge intake result and direct the operator to manual capture without creating a second intake UI. |

## Voice and Tone

Operator copy is Vietnamese-first, direct, and operationally precise without becoming raw diagnostics.

| Situation | Copy |
| --- | --- |
| Candidate recommendation | `Nên xem xét: phù hợp với khoảng trống kiến thức về tuyến ven biển.` |
| Vietnamese language fit | `Nội dung tiếng Việt` |
| Likely Vietnamese language fit | `Có khả năng là tiếng Việt` |
| Foreign fallback section | `Nguồn ngoại ngữ bổ sung` |
| Too short aggregate reason | `Video quá ngắn` |
| Unknown duration aggregate reason | `Không xác định được thời lượng` |
| Non-Vietnamese aggregate reason | `Không phải nội dung tiếng Việt` |
| Unknown language aggregate reason | `Chưa xác định được ngôn ngữ` |
| Accept success | `Đã thêm URL vào nguồn chờ xử lý. Bạn vẫn cần chạy YouTube Capture thủ công.` |
| Intake duplicate | `URL này đã có trong nguồn chờ xử lý hoặc đã được lưu trước đó.` |
| Accept failure | `Chưa thể thêm URL vào nguồn. Thử lại sau.` |
| Discovery disabled | `Discovery đang tắt. Hệ thống sẽ không tìm hoặc triage video mới.` |
| In-flight cancellation | `Một số tác vụ đang chạy sẽ dừng trước lần gọi hoặc ghi dữ liệu tiếp theo.` |
| Rate limit | `Discovery đang bị giới hạn bởi nhà cung cấp. Hệ thống sẽ thử lại theo lịch.` |

## Component Patterns

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Action queue | Default Discovery entry | Contains only action-required groups. Each item opens the correct candidate, Mission need, or Health incident. Normal deferrals and routine successful runs do not appear. |
| Candidate queue | Candidate review workspace | Paginated or explicit load-more Vietnamese-first ranked list. One selected candidate at a time. Rows show thumbnail, title, channel, duration, formatted views, exact/relative publish time, language-fit label, and safe recommendation; they never use raw comments or model text. After an action, refetch active results and select the first remaining eligible candidate; otherwise show completion state. |
| Candidate inspector | Candidate review workspace | Shows safe candidate context, channel, duration, views, publish time, language fit, originating query, safe eligibility reason, recommendation, concise factors/penalties, derived comment signals, and prior safe capture outcome. Numeric scores are progressive disclosure for authorized operators only. |
| Foreign fallback | Candidate review workspace / Mission | `Nguồn ngoại ngữ bổ sung` contains only bounded same-need fallback and is never interleaved with the Vietnamese-first primary queue. It retains the same metadata and trust warnings. |
| Accept | Candidate inspector | Immediate server action. Disable duplicate actions while pending. Calls existing Knowledge intake API. Submitted and duplicate outcomes each persist `accepted`, announce accurate distinct copy, remove the row, and select the next ranked candidate. An unknown outcome reconciles server state before retry is offered. A confirmed failure preserves selection and offers retry. |
| Defer | Candidate inspector | Persists `deferred`, removes it from the immediate review queue, and keeps safe priority/history for later review. |
| Skip | Candidate inspector | Persists `skipped` after a concise immediate action. No confirmation dialog in the initial slice. It removes the candidate from review and retains only safe audit/dedupe state under retention policy. |
| Query proposal list | Knowledge Mission | One combined list for `Hệ thống đề xuất` and `Operator tạo`. Supports simple create, text edit, priority change, and pause/resume. It does not provide advanced rule-builder controls. |
| Province coverage table | Knowledge Mission | Shows current province/city, related legacy province names, bounded Knowledge counts by topic, and latest update. Search matches current and legacy names. Operator selects a bounded scope before asking AI for suggestions. Counts never claim completeness by themselves. |
| AI knowledge suggestion | Knowledge Mission | Shows current geography, related legacy label when useful, proposed knowledge need, concise reason, and natural Vietnamese query. Explicit actions are `Chạy ngay`, `Sửa`, and `Bỏ qua`; AI never starts Discovery without operator confirmation. |
| Query run progress | Knowledge Mission / query detail | After `Chạy ngay`, shows `Đang chờ`, `Đang chạy`, `Hoàn tất`, `Thất bại`, or `Đã hủy`, bounded start/end times, candidate count, candidate-processing progress, safe retry, and `Xem video` when reviewable results exist. |
| Global Discovery switch | Automation Health/settings | Immediate server action with visible enabled/disabled state. Disabling fences Discovery planning/search/enrichment/triage work only; it does not alter queued Knowledge sources or execute/cancel `youtube:capture`. |
| Health incident | Automation Health/action queue | Shows safe provider/stage/time/retry context. Persistent failures and rate limits are action-required; ordinary retrying states remain visible in Health but are not alerts. |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| No action-required work | Action queue | Calm completion state with links to Mission and Health. Do not invent work or replace it with KPI cards. |
| Candidate selected | Review workspace | Inspector mirrors safe candidate data and exposes one-at-a-time actions. |
| Candidate Accept pending | Inspector | Disable actions, keep context visible, announce pending state through `aria-live`. |
| Candidate accepted after intake submitted | Inspector/queue | Show concise success, remove candidate from queue, advance to next candidate, and toast the manual-capture reminder. |
| Candidate accepted after intake duplicate | Inspector/queue | Treat as completed handoff, use duplicate-specific success copy, remove candidate, and advance to next candidate. |
| Candidate intake failure | Inspector | Keep candidate selected and reviewable. Show safe retry action; do not mark accepted or claim a source exists. |
| Candidate deferred/skipped | Queue | Persist action, remove from immediate queue, then select the next ranked item. |
| No selected candidate | Review workspace | Show a short queue-guidance state, not an empty inspector with actions. |
| No reviewable candidate / no filtered result | Review workspace | Distinguish an empty review backlog from a filter/pagination result with no rows, with a clear reset-filter or return-to-queue action. |
| Primary language/duration ineligible | Mission/Health only | Keep too-short, duration-unknown, non-Vietnamese, and language-unknown candidates out of Action Required and primary review. Show only aggregate Vietnamese reason labels and bounded counts in Mission/Health. |
| Qualified foreign fallback | Review workspace / Mission | Show under `Nguồn ngoại ngữ bổ sung`, never as part of primary Vietnamese ranking, and identify it as supplemental context. |
| Discovery enabled | Health/settings | Display `Đang bật`, last/next run, and safe recent result. |
| Discovery disabled | Health/settings/action queue | Display `Đang tắt`, no next run, and a paused schedule explanation. New Discovery work pauses; existing Knowledge sources and manual capture remain unaffected. |
| Disable while work is running | Health/settings | Toggle responds immediately. Show `Đang dừng tác vụ`; individual runs distinguish fencing requested, cancelled, or completed before cancellation. Repeated toggles are guarded until server confirmation. |
| Discovery re-enabled | Health/settings | Display the next eligible scheduled planning/query run. Cancelled runs remain terminal and are not revived. |
| Provider/rate-limit/schema retry | Health | Safe incident status and retry context. Escalate to action queue only when persistent or blocking high-priority work. |
| Mission query paused | Mission | Keep query visible with paused state and reason/history; it creates no due run until resumed. |
| Immediate query queued/running | Mission | Keep the accepted or operator-authored query visible with current safe status and progress. It does not show a scheduled wait as the next required action. |
| Global Discovery off / query enabled | Mission | Show `Tạm dừng do Discovery đang tắt`, distinct from `Tạm dừng bởi operator`; no next run is shown until global enablement returns. |
| Health first run / unavailable / stale | Health | Distinguish no run yet, no incident, unavailable projection, and stale projection. Show last-updated time and reload recovery; never present missing telemetry as healthy operation. |
| Desktop on narrow viewport | Admin | Collapse split panes into sequential queue/detail views. Keep all authorized query and policy controls reachable without horizontal two-dimensional scrolling. |

## Interaction Primitives

- Candidate queue is keyboard navigable; a row selection announces a concise candidate title and recommendation without reading the whole inspector. An explicit detail action may move focus to the inspector heading.
- `Accept`, `Để sau`, and `Bỏ qua` are explicit labeled buttons. Accept has no confirmation dialog; destructive policy changes retain explicit confirmation when introduced.
- After Accept, defer, or skip, focus moves to the selected next queue row; if no rows remain, focus moves to the queue heading/completion state.
- Toasts announce acceptance result but do not steal focus. Queue pagination retains focus on load-more; page changes move focus to the queue heading or first result and announce range.
- Global switch changes immediately. Its status text updates through `aria-live` and remains visible in Health.
- Query pause/resume, text edit, and priority actions are explicit server-backed commands. Pausing affects future due work; currently claimed work follows the Worker fence/reconciliation result shown in Health. Invalid query fields expose programmatic error association and move focus to the first invalid input on submit failure.
- No hover-only action is required. Tables/lists use pagination or explicit load-more, never infinite scroll.

## Accessibility Floor

- WCAG 2.2 AA target; visual contrast follows `DESIGN.md` and inherited shadcn behavior.
- Status uses text and icon in addition to `{components.status-pending}`, `{components.status-deferred}`, or `{components.status-healthy}` color.
- Keyboard focus is visible with at least 3:1 contrast and is never hidden by fixed navigation, inspector, toast, or sheet chrome.
- Queue rows expose title, channel, duration, view count, publish time, language fit, recommendation, priority, and selected state to screen readers without reading decorative thumbnail detail.
- Inspector updates use a labelled region; action completion and safe failures announce through polite `aria-live`.
- Keyboard users can traverse queue, open progressive score detail, perform actions, and return to the next candidate without pointer use.
- Touch targets are at least 44px where mobile basic detail is supported.
- Mobile reflows authorized controls into sequential views rather than withholding functionality. It may reduce density and replace split panes with detail pages/sheets.

## Trust, Privacy, And Provenance

- Candidate factors, view count, publish time, channel metrics, comments, and AI-triage output are ranking context only. UI must not present them as verified facts, evidence, or publication approval.
- View count is localized compactly, for example `125 nghìn lượt xem`. Publish time shows the exact date and relative age, for example `12/05/2025 · 1 năm trước`; the exact date remains available to assistive technology.
- New-policy language/duration distributions and fallback counts are measured separately from historical records. The UI does not reclassify, backfill, supersede, or assign synthetic operator states to historical candidates or recommendations.
- Derived comment signals never contain raw comments, links, instruction-like text, PII, or traveler-visible content.
- Health/error surfaces use bounded safe summaries only; never render secrets, raw provider errors, prompts/responses, provider payloads, transcripts, media, raw source material, evidence spans, or traveler data.
- Acceptance feedback describes only the Knowledge intake handoff. It does not claim successful Gemini processing, knowledge extraction, evidence creation, card activation, or traveler retrieval.

## Responsive & Platform

Discovery operations are desktop-first: desktop/tablet uses the full action queue, queue-plus-inspector review, Mission query management, Health, and global switch together.

Mobile and narrow viewports retain every authorized function through sequential list/detail routes or sheets. They do not use the dense desktop split-pane layout, but candidate review, query management, Health, and policy controls remain reachable without horizontal two-dimensional scrolling.

## Key Flows

### Flow 1 - Accept a ranked candidate (Mai, operator beginning the workday)

1. Mai opens the role-protected Discovery control tower on desktop.
2. The default action queue shows a few candidates needing review, one stalled high-priority coverage need, and one persistent rate-limit issue.
3. She opens the top candidate. The queue remains visible while the inspector shows safe metadata, the query reason, a plain-language recommendation, factors, and penalties.
4. Mai selects `Accept`.
5. The inspector disables actions while the command calls the existing Knowledge intake API with the canonical URL.
6. The API reports submitted or duplicate. The UI records the candidate as accepted, removes it from the review queue, selects the next candidate, and shows: `Đã thêm URL vào nguồn chờ xử lý. Bạn vẫn cần chạy YouTube Capture thủ công.`
7. **Climax:** Mai turns a promising URL into a queued Knowledge source without mistaking that handoff for capture or publication.

Failure: Knowledge intake fails. The candidate remains selected, no success state is shown, and Mai receives a safe retry action.

### Flow 2 - Pause Discovery during a provider issue (Mai, responding to rate limits)

1. Mai opens an action-queue item for a persistent rate-limit issue.
2. Automation Health shows the safe provider/stage summary, affected run count, and recent retry context.
3. She turns the global Discovery switch off.
4. The switch updates immediately to `Đang tắt` and announces that new planning/search/enrichment/triage work stops; in-flight work is fenced before later provider calls or writes.
5. The UI states that queued Knowledge sources and manual `youtube:capture` are unaffected.
6. **Climax:** Mai stops new Discovery work safely without fearing that existing capture work or knowledge will be changed.

Failure: The toggle command fails. The previous state remains visible and the UI provides a safe retry message.

### Flow 3 - Turn bounded coverage into an immediate managed query (Mai, planning for a province)

1. Mai opens Knowledge Mission and views Knowledge coverage grouped by current province/city. Legacy province names remain searchable and visible as references.
2. She chooses a bounded geography and asks AI for suggestions. The system shows proposed knowledge needs, reasons, and Vietnamese queries derived only from safe coverage and demand summaries.
3. Mai edits one suggestion or creates a simple operator query, then selects `Chạy ngay`.
4. The same surface shows `Đang chờ`, `Đang chạy`, candidate count and processing progress, then `Hoàn tất` with `Xem video`; it does not make Mai wait for the next scheduled cadence.
5. **Climax:** Mai chooses what Discovery looks for and can follow it to reviewable results without building automation rules or interpreting Worker configuration.

Failure: The query is invalid, Discovery is disabled, admission conflicts, or execution fails. The editor preserves Mai's draft and the surface shows an accurate safe recovery action without claiming that a run or candidate exists.

### Flow 4 - Trace a coverage need to candidates (Mai, closing a road-condition gap)

1. Mai opens an aged high-priority coverage need from the action queue.
2. Coverage detail shows the corridor/category/season reason, linked system query proposals, and their latest safe run results.
3. She opens a linked query and then its ranked candidate list.
4. She reviews a candidate in the existing queue-plus-inspector pattern and accepts it when appropriate.
5. **Climax:** Mai can see why a URL matters to a knowledge gap before sending it to Knowledge intake.

### Flow 5 - Route a high-impact Knowledge recommendation (Mai, reviewing conflict context)

1. A high-impact verification/conflict item appears in the action queue with safe context.
2. Mai opens the existing Knowledge recommendation surface from that item.
3. Discovery provides only the linked need/query context; Knowledge owns every verification, publication, and conflict decision.
4. **Climax:** The control tower brings urgent work to attention without implying Discovery can change a Knowledge claim.

## Open Questions

| Question | Impact | Owner / Next Step |
| --- | --- | --- |
| Exact initial scoring labels, score bands, and priority labels | Candidate explanation and queue ordering | Discovery policy tuning story |
| Whether `skip` requires a lightweight reason | Audit usefulness versus speed | Discovery implementation/story scope |
| Exact Health metrics latency and historical retention | Health table/detail behavior | Discovery read-model story |
| Full Discovery settings/policy editor | Admin scope after initial control tower | Future UX update |
| Candidate, channel, and query blocking | Exclusion policy and audit scope | Deferred from initial slice |
