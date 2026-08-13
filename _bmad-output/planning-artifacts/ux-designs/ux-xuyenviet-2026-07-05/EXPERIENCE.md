---
name: XuyenViet
status: final
project: xuyenviet
created: 2026-07-05
updated: 2026-08-05
sources:
  - ../../prds/prd-xuyenviet-2026-07-04/prd.md
  - ../../architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - ../../epics.md
  - ../../sprint-change-proposal-2026-08-03-direct-api-session-auth.md
---

# XuyenViet — Experience Spine

> Fast-path UX contract for responsive web public MVP. Paired with `DESIGN.md`. Spines win on conflict with future mockups or implementation shortcuts.

## Foundation

Responsive web app for consumer MVP. Next.js App Router is the traveler presentation layer and the separately deployed admin app is a presentation client; both call NestJS APIs directly. NestJS owns protected domain API, Google OAuth, opaque browser sessions, CSRF, and worker transport. React, shadcn/ui, Tailwind, and PostgreSQL-backed auth/session data follow the architecture. `DESIGN.md` is the visual identity reference; this document owns information architecture, behavior, states, flows, accessibility, and interaction contracts.

The traveler experience uses four canonical states: a logged-out public homepage with a sign-in-gated ask box, a logged-in empty state with a left sidebar plus centered greeting/composer, an active AI Ask workspace with left history/projects, center answer, and right contextual detail panel, and a Trip Project workspace with Trip Home, structured plan, and its primary conversation. Their visual references are [`home-logged-out.html`](./mockups/home-logged-out.html), [`home-logged-in-empty.html`](./mockups/home-logged-in-empty.html), [`three-panel-chat-map.html`](./mockups/three-panel-chat-map.html), and [`trip-project-workspace.html`](./mockups/trip-project-workspace.html). `DESIGN.md` and this experience spine win on conflict with the static mockups.

Primary audience: Vietnamese road-trip travelers planning by car, initially focused on Hanoi-to-HCMC corridor use cases. Secondary audience: owner/admin/operator managing travel knowledge.

[ASSUMPTION] UX copy is Vietnamese-first for traveler surfaces. Admin/operator surfaces may use Vietnamese labels with technical metadata names where useful during MVP.

[ASSUMPTION] The MVP has no Google Maps integration. Route and place guidance is text/card/detail-panel based, with map integration explicitly deferred.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Public logged-out homepage | Root route, referral link | Explain value, show Google sign-in path, preserve referral parameter silently, and show sign-in-gated ask box |
| Sign-in / auth callback states | Public entry, protected-route redirect | Google sign-in, safe error handling, post-auth continuation |
| AI planning shell | Primary app route after auth | Edge-to-edge, viewport-height workspace containing sidebar, main AI Ask chat, conditional contextual detail panel, account/admin entry, and responsive sheets |
| Logged-in empty chat | AI planning shell with no selected/created conversation content | Chat-first centered greeting, natural-language composer, complete starter requests, left sidebar, and no right detail panel |
| Active AI Ask chat | Main shell workspace after question/answer exists | Vietnamese road-trip companion conversation with readable guidance, concise follow-ups, optional trip recommendations, and selectable answer entities |
| Conversation history | Left sidebar on desktop, navigation sheet on mobile | Create, scan, revisit, continue, and delete user-owned conversations from the `Trò chuyện` group |
| Trip projects | Left sidebar project group plus selected chat context | Focus planning around a durable trip and reuse trip context like a project/workspace from the distinct `Chuyến đi` group |
| Trip Project workspace | Selected Trip Project | Show Trip Home, confirmed structured plan, primary conversation, pending changes, and history without converting the project into a widget dashboard |
| Trip Home | Trip Project workspace | Put the next decision or next planned leg in focus before the plan timeline and conversation |
| Structured plan | Trip Project workspace | Review anchors, legs, activities, constraints, and `idea` / `planned` / `confirmed` / `backup` states; request all plan changes through the primary conversation |
| Change proposal review | Assistant answer or Trip Home | Let the owner inspect, apply, dismiss, or refresh a typed AI proposal before any persistent plan state changes |
| Right contextual detail panel | Selected answer entity in active chat | Show selected place, hotel, route segment, source, cost/warning, or trip fact with quick facts, related details, actions, and optional plain-language verification detail |
| Trip project detail/context panel | Trip project row / selected context | Show trip context, linked chats, correction/delete affordances, usually as right detail panel or mobile sheet |
| Source detail | Relevant verification disclosure / detail panel | Explain what to verify and why; show a safe source title, optional link, and useful checked date without technical taxonomy or diagnostics |
| Account/privacy | Avatar menu / storage notice | Explain stored chat/trip details, deletion entry points, sign out |
| Admin shell | Role-protected nav | Separate operator/admin workspace |
| Knowledge intake | Admin shell | Submit URL, text, copied post, screenshot metadata for AI extraction |
| Review recommendations | Admin shell / intake success | Prioritize AI-recommended review, verification, conflicts, and quality samples without blocking low-risk active publication |
| Knowledge card detail | Recommendation queue / active-card list | Inspect current fact, evidence, states, and provenance; revise, suppress, restore, or record verification through explicit actions |
| Seed progress | Admin shell | Track 100 active evidence-grounded Hanoi-to-HCMC corridor knowledge cards |
| Feedback / quality signal | Assistant answer footer | Capture lightweight usefulness feedback without interrupting planning or displacing the composer |

Responsive navigation:

| Breakpoint | Behavior |
|---|---|
| Desktop `lg+` | Logged-out homepage has no app sidebar. Logged-in empty state shows a flat left sidebar + centered composer only. Active chat shows an edge-to-edge left sidebar + center answer + right contextual detail panel only after selection. |
| Tablet `md` | Sidebar may collapse to a rail. Active detail panel may remain right-side if space allows or move below/sheet. |
| Mobile `< md` | Top bar + full-height navigation sheet. Chat is single-column. Composer remains reachable. Selected detail opens as sheet/drawer. |

Modal stacks one level deep. Use sheets for drill-in context on mobile. Do not open dialog on top of dialog.

Sidebar hierarchy:

| Zone | Required behavior |
|---|---|
| Brand row | Shows the XuyenViet mark/name and a collapse or menu control where the viewport supports it. |
| Top action | `Hỏi XuyenViet` starts an unscoped natural-language conversation. It does not ask the traveler to classify intent as ordinary chat or Trip Project before asking. |
| Conversation history | Shows recent user-owned conversations under `Trò chuyện`, with a compact active row, short title/preview/date, delete action, and empty state. It must never show another user's conversations. |
| Trip projects | Shows user-owned trips under `Chuyến đi của bạn` as compact rows with route/date context and useful state. Selecting a trip makes it active planning context and shows its primary conversation. A small secondary create affordance may exist for returning users, but assistant-suggested creation remains the primary discovery path. |
| Context indicator | The main chat must clearly show whether it is ordinary chat or scoped to a selected trip project. |
| Account/admin | Account/privacy always reachable. Admin entry appears only to authorized operator/admin roles and remains visually separate from traveler planning. |

Right detail panel hierarchy:

| Zone | Required behavior |
|---|---|
| Selected entity header | Names what the user selected from the answer, such as `Asia Park`, a hotel area, a route segment, or a source, and identifies its category with a semantic icon. |
| Summary | Gives a short, useful explanation in Vietnamese without duplicating the whole answer. |
| Actions | Provides contextual actions such as `Dùng trong kế hoạch`, `Xem tuyến đường`, or `Lưu` only when the associated behavior is supported. Unsupported mockup actions must not render as inert controls. |
| Quick facts | Shows compact traveler-relevant facts such as family fit, best time, what to verify, or route impact. |
| Related details | Shows related route/hotel/driving/source notes. |
| Verification detail | Uses persisted safe provenance to explain source relevance and freshness without exposing raw material, source taxonomy, confidence codes, or diagnostics. |

## Voice and Tone

Microcopy is Vietnamese-first, practical, and calm. Brand posture lives in `DESIGN.md`.

| Do | Don't |
|---|---|
| `Bạn muốn đi đâu, đi mấy ngày, và đi cùng ai?` | `Hãy nhập đầy đủ thông tin để hệ thống hoạt động chính xác.` |
| `Mình có thể gợi ý trước, rồi hỏi thêm vài chi tiết.` | `Không đủ dữ liệu.` |
| `Thông tin này có thể thay đổi. Kiểm tra lại trước khi đặt dịch vụ.` | `Cảnh báo: dữ liệu không đáng tin cậy.` |
| `Thông tin này nên được kiểm tra lại trước khi đi.` | `Nguồn xấu` |
| `Xóa cuộc trò chuyện này? Nội dung sẽ không còn dùng trong câu trả lời.` | `Bạn có chắc không?` |
| `Mình chưa có thông tin đủ chắc để khẳng định điều này. Bạn nên kiểm tra lại trước khi quyết định.` | `Không có dữ liệu. Trạng thái truy xuất: failed.` |

Tone rules:

- Be useful before demanding forms.
- Ask at most a few concise follow-up questions at a time.
- Say what is known, what is uncertain, and what the user should verify.
- Avoid guilt, hype, gamification, and fake certainty.
- Never imply referral rewards, credits, or rankings exist in MVP.

## Component Patterns

Behavioral patterns. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Public logged-out homepage | Root route | Explains AI road-trip assistant value in one centered screen. Primary CTA is Google sign-in. Shows a sign-in-gated ask box, icon-led starter chips, and a compact detail-panel preview. If `ref` exists, preserve it silently through auth. |
| Sign-in-gated ask box | Public homepage | Looks like the chat composer but submitting requires authentication before conversation, retrieval, usage event, or provider call is created. |
| Google sign-in button | Public entry, protected-route gate | Opens OAuth flow. Failure returns safe message without exposing provider details or secrets. |
| Protected-route gate | AI Ask/admin | If unauthenticated, redirect or block before loading chat/trip/admin data. No AI call or conversation is created. |
| Chat composer | AI Ask | Accepts Vietnamese free text and supported image attachments. In an unscoped chat it invites a natural trip description without a mode choice or technical scope label. In a selected trip it shows compact traveler-language context, but has no persistent scope-switch or leave-trip controls. `Hỏi XuyenViet` starts an unscoped chat, and the sidebar/sheet Trip Project list switches projects. Its idle state contains prompt, icon-only attachment trigger, and icon-only send trigger; each has an accessible name and hover/focus tooltip. Empty/invalid submission is blocked client-side and server-side. Unsupported image type/size is rejected before provider calls. Submit is disabled while sending unless retrying a failed draft. |
| App shell sidebar | AI planning shell | Flat and persistent on desktop, sheet on mobile. Contains brand row, new chat, grouped conversation history, grouped trip projects, account/privacy, and authorized admin entry. It must be usable by keyboard and touch; row actions cannot be hover-only. |
| New chat action | Sidebar/top bar | Starts an unscoped conversation as `Hỏi XuyenViet`. If a trip is active, the action makes leaving that context explicit rather than silently carrying trip constraints forward. |
| Logged-in empty start | AI planning shell before first prompt | Shows left sidebar, compact top bar, centered Vietnamese greeting, centered composer with a complete natural-language example, four situation-led starter prompts, and no right detail panel. |
| Conversation history row | Sidebar/sheet | Opens an owned conversation. Active row reflects the current route/conversation. Row menu supports delete and future rename. Delete requires confirmation. |
| Trip project row | Sidebar/sheet | Opens a trip project workspace/context. Active project state is visible in sidebar and main chat header. Row menu supports delete/settings when implemented. |
| Trip Project workspace | Selected project | Uses the primary conversation as the desktop center column. A persistent right Trip Workspace shows Trip Home, the confirmed structured plan, and history entry points. Historic linked chats remain available but do not compete with the primary conversation. |
| Trip Home focus card | Trip Project workspace | Shows one highest-priority item: pending unexpired proposal with expiry, another pending unexpired proposal, a defined confirmed-item gap, the next dated planned/confirmed leg, then preparation. A gap is only confirmed transport without date/time or route context, or confirmed accommodation without date/time or place/area; incomplete `idea` or `planned` items are not gaps. A pending proposal remains visible here with its principal impact and a `Xem đề xuất và tác động` entry point even when the desktop panel is closed or becomes a mobile sheet. |
| Structured plan timeline | Trip Project workspace | Groups anchors, legs, and activities by date/leg. Each item shows semantic type, state label, and concise time/place detail when known. It is read-oriented; the primary conversation is the sole plan-authoring surface, and its typed proposals are the only path to persistent changes. |
| Primary conversation composer | Trip Project workspace | Is anchored at the end of the center conversation column. It writes to the one primary conversation and shows the active project context. Historic linked chats open from `Lịch sử trao đổi`, not as parallel composers. |
| Trip Change Proposal | Chat answer / Trip Home / plan timeline | Renders a bounded before/after summary, rationale, affected plan items, expiry when applicable, and explicit actions. `Áp dụng` is a confirmed mutation, `Giữ kế hoạch` dismisses, and `Xem phương án khác` appears only when alternatives exist. |
| Plan history | Trip Project workspace | Opens on demand and lists applied, dismissed, and expired proposals with safe summaries, actor, and timestamp. It never displays raw model prompts/responses. |
| Assistant answer | Chat | Reads as a companion message: short orientation, scannable plan/options, practical next step, and at most three concise follow-ups. Warnings, sources, uncertainty, and trip actions appear only when relevant and use hierarchy before adding card boundaries. The default path has no mandatory outer answer card. |
| Section chips | Active assistant answer | A compact scrollable row at the top of the answer that jumps to relevant sections such as `Ăn gì?`, `Đi đâu?`, `Ở đâu?`, `Về chuyến đi`, `Cần biết`, and `Chi phí và mẹo`. |
| Selectable answer entity | Active assistant answer | Persisted, provenance-bound places, hotel areas, route segments, source chips, warnings, costs, and trip facts can be selected/focused to open the right detail panel. The UI must not create entities by parsing answer prose at render time. |
| Right contextual detail panel | Active AI Ask chat | Opens only when a selected entity exists. Shows title, summary, actions, quick facts, related details, and optional plain-language verification detail. It must not appear on the logged-in empty state. |
| Streaming assistant answer | AI Ask | Shows incremental assistant text after preparation starts generation. Partial text is visually pending and reconciles to the persisted final assistant message when complete. If streaming fails, show a plain-language retry/recovery message and do not imply the partial answer is saved as final; never expose internal preparation, provider, or status terminology. |
| Follow-up questions | Assistant answer footer | 1-3 concise questions. Tappable suggestions prefill composer; user can edit before sending. They answer the immediate question and are never a generic feature menu. |
| Trip recommendation | Assistant answer | A compact conversational action offered only when durable trip context makes saving a new trip or continuing in one or more owned trips useful. The traveler explicitly chooses save, continue, private answer, another trip, or decline. |
| Source summary row | Assistant answer | Shows a compact, action-oriented verification disclosure only when relevant. It opens source detail and never exposes raw operator-only material. Generic source-category chips are not required in the default reading path. |
| Source detail | Relevant verification disclosure/right detail panel | Uses persisted provenance to explain what should be checked and why. It may show safe source title/label, URL, and useful date, but not source categories, confidence codes, provenance IDs, retrieval policy, provider/model details, or audit/process status. |
| Storage notice | First AI Ask / account privacy | Informs users chat/trip details may be stored for current session/project. Link to details. Must not block asking unless legal policy later requires consent. |
| Trip context indicator | AI Ask header/composer | When a Trip Project is selected, shows its name in traveler language, for example `Đang lên kế hoạch cho: Hè miền Trung`. Ordinary unscoped chat shows no technical scope/context label. `Hỏi XuyenViet` explicitly starts an unscoped chat; the sidebar/sheet Trip Project list explicitly switches projects. |
| Context correction hint | AI Ask / trip detail | If extracted context changes, show small confirmation-style note when useful: `Mình đã cập nhật: con 8 tuổi.` |
| Delete confirmation | Chat/trip project | Names what will be removed or disabled from normal UI/retrieval. Requires explicit destructive click. |
| Admin card form | Knowledge card detail | Structured edit form. Evidence-validated edit, suppress, restore, request/record verification, and relation/conflict resolution are distinct actions. Active low-risk cards must not be presented as awaiting approval. |
| Intake submitter | Knowledge intake | Supports URL, raw text, copied post content, and screenshot/file metadata. Failed extraction is recoverable and creates no active knowledge card. |
| Review recommendation queue | Admin | Filter by source, type, route/location, publication/knowledge/review/verification state, confidence, and freshness. Operators resolve prioritized recommendations; qualifying low-risk claims may already be active. |
| Usefulness rating | Assistant answer footer | Lightweight positive/negative action after answer. Optional targeted reason/comment only appears after negative feedback; it never blocks chat or consumes card-sized vertical space. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold public entry | Public logged-out homepage | Value proposition, sign-in CTA, sign-in-gated ask box, and starter chips. No app data requested. |
| Referral link present | Public entry/sign-in | No reward UI. Preserve attribution through sign-in. If invalid, continue normally. |
| Unauthenticated protected route | AI Ask/admin | Redirect to sign-in or show gate. State: `Đăng nhập để hỏi AI.` |
| Auth failure | Sign-in | Safe message, retry button. No secret/provider diagnostic. |
| First AI Ask empty | Logged-in empty chat | Left sidebar visible, compact top bar and center greeting/composer visible, icon-led starter cards visible, no right detail panel. |
| Sending message | AI Ask | Pending state in chat, composer disabled or guarded against duplicate submit. |
| Streaming AI response | AI Ask | Answer text may appear progressively after source/context preparation. Keep composer guarded, expose stop/retry only if implementation supports safe cancellation, and announce completion through `aria-live`. |
| Stream retry or reconnect | AI Ask | Reuse the original idempotency key and restore the persisted in-progress or terminal command state. Do not submit a second AI request solely because the connection was ambiguous. |
| Planning state changed during answer | AI Ask | When final persistence returns `refresh_required`, remove pending partial treatment and show `Kế hoạch hoặc cuộc trò chuyện đã thay đổi. Hãy làm mới rồi hỏi lại.` Do not present partial text as a saved answer. |
| Post-answer processing delayed or failed | AI Ask | Keep the completed answer intact. Show a compact, non-blocking plain-language note only when it changes a traveler action; never expose context extraction, annotations, proposal drafting, consumer, job, or failure-state terminology. |
| API-safe failure | AI Ask/admin | Traveler UI projects a practical Vietnamese recovery message without provider payloads, model/provider names, tokens, SQL, stack traces, error codes, request IDs, provenance/retrieval terms, or internal transport diagnostics. Authorized admin UI may use separate safe operational projections. |
| Long AI response | AI Ask | Progress copy after delay: `Mình đang kiểm tra ngữ cảnh và nguồn phù hợp...` Do not imply completion. |
| Image attached to prompt | AI Ask | Reveal a compact thumbnail/file row with an icon-only remove action, type/size validation, and accessible label. Do not upload or submit unsupported images to the provider. |
| Image input rejected | AI Ask | Reveal the allowed file types/size beside the validation error and keep the user's text draft intact. No provider call is made. Do not reserve idle composer space for this explanation. |
| AI provider failure | AI Ask | Keep user draft. Show retry. Do not create misleading assistant message. |
| No sufficient information | Assistant answer | State what cannot be confirmed and what the traveler should check next. Do not disclose retrieval/source categories or model reasoning. |
| Freshness-sensitive answer | Assistant answer | Show freshness warning near relevant section and in source details. |
| Conflicting sources | Assistant answer | State conflict plainly and ask user to verify; prefer official/provider sources when available. |
| No selected answer entity | Active AI Ask chat | Do not force an empty detail panel. Keep the right column absent/collapsed until the user selects a supported entity. |
| Selected place/hotel/route/source | Right detail panel | Replace panel contents with the selected entity's summary, quick facts, related details, action chips, and provenance. |
| Empty chat history | Chat sessions | Message + action to start first chat. |
| Empty trip projects | Sidebar/sheet | Short explanation plus create-project entry when available. Do not block ordinary chat. |
| Trip creation recommendation | Assistant answer | Offer saving only after useful guidance and durable context. Declining keeps the current conversation unscoped; do not repeat the offer unless context materially changes or the traveler asks to save. |
| Existing-trip recommendation | Assistant answer | Offer one high-confidence owned trip, multiple plausible owned trips, or one plain-language clarifying question. Never attach project context without an explicit traveler choice. |
| Sidebar loading | AI planning shell | Use skeleton rows for conversations and trips independently so chat can remain readable while lists load. |
| Sidebar collapsed | Tablet/desktop if implemented | Preserve new-chat access and active workspace affordance. Do not hide trip context state completely. |
| Deleted chat/project | Chat/trips | Remove from normal UI and retrieval. Show brief success toast. |
| New Trip Project | Trip Project workspace | Show a calm setup state with a primary composer and minimal structured-plan prompt. Do not force a long form before useful chat guidance. |
| Open plan item | Structured plan | Render an `Ý tưởng` state as intentionally open; offer status/edit controls but no error treatment. `Đã chốt` means the owner confirmed the choice or supplied a real constraint, not that a booking or live provider check exists. |
| Pending proposal | Trip Home / chat / timeline | The AI answer contains a concise proposal card and Trip Home owns the persistent entry point, each showing the principal impact and `Xem đề xuất và tác động`. The Trip Workspace panel or mobile sheet owns the complete before/after review and apply/dismiss actions. Do not silently merge it into the timeline. |
| Applying proposal | Proposal review | Disable duplicate actions, announce pending save, and keep the prior plan visible until the server result reconciles. |
| Proposal conflict or stale version | Proposal review | Preserve the proposal summary, state that the plan changed, and offer `Làm mới đề xuất` in the primary conversation or return to the current plan. Do not overwrite newer confirmed changes. |
| Proposal expired | Proposal review/history | Mark as expired, remove apply action, retain safe history, and invite a fresh question when useful. |
| Applied/dismissed proposal | Timeline/history | Reconcile the plan timeline to persisted state and announce the outcome. Applied records show actor/time; dismissed records do not alter plan state. |
| Unauthorized data access | Any owned resource | Deny server-side. Show generic not-found/permission message without exposing existence details. |
| Admin no role | Admin | Deny route server-side; no admin navigation shown to normal travelers. |
| AI-first ingestion pending | Admin intake/review | Show technical job status (`queued`, `running`, `completed`, or `failed`) separately from candidate processing/disposition, card lifecycle (`draft`, `pending_operator`, `active`, `suppressed`, `archived`, or `rejected`), and recommendation status (`open`, `resolved`, or `superseded`). Do not imply a technical job outcome is a publication outcome. |
| Extraction failed | Admin intake | Error reason safe for operator. Retry or edit source. No active knowledge card is created. |
| 100-card seed incomplete | Seed progress | Count active evidence-grounded corridor cards and remaining gap. Show distribution gaps by type/route plus review and verification signals. |

## Interaction Primitives

- Click/tap to act. Hover-only controls are forbidden on mobile.
- `Enter` submits composer when focus is in single-line prompt mode; `Shift+Enter` inserts newline when multiline is enabled.
- `Esc` closes the topmost sheet, drawer, popover, or dialog.
- `/` may focus chat composer on desktop when no input is active.
- Use icon-only controls for common, unambiguous actions such as attach, send, close, menu, delete, and collapse. Each icon-only control has an accessible name, a visible focus state, and a tooltip on hover/focus; destructive actions still use explicit text confirmation.
- Keep the idle chat composer free of persistent input labels, attachment instructions, keyboard cheat sheets, and verbose status copy. Reveal guidance only when focus, an error, pending work, or a selected attachment makes it useful.
- A trip recommendation, verification disclosure, or feedback control must not steal focus from the composer or prevent the next message.
- Source chips, section chips, warning callouts, and selectable entities must be keyboard-focusable when they open details or navigate within the answer.
- Selectable answer entities are keyboard-focusable and expose the selected state when their detail panel is open.
- Right detail panel can be closed with `Esc` and returns focus to the selected entity or the control that opened it.
- Sidebar rows are keyboard-focusable, expose active state, and support row actions without requiring hover.
- On mobile, opening the sidebar sheet moves focus into the sheet; closing it restores focus to the menu trigger.
- Selecting a conversation or trip project from the mobile sheet closes the sheet and moves focus to the main chat heading or composer.
- Destructive actions require explicit confirmation; no swipe-to-delete on web MVP.
- Infinite scroll is avoided for admin review queues in MVP; use pagination or explicit load-more to preserve review state.
- Generated AI answer text is not editable by the traveler; the user corrects facts by sending another message.
- `Áp dụng thay đổi` is always an explicit owner action. It uses a confirmable primary button and never appears as an automatic effect of sending a chat message.
- Proposal review reveals a concise before/after impact before the owner applies it. Keyboard focus moves to the proposal heading when opened, and a terminal result returns focus to the originating answer card or Trip Home focus card.
- Plan mutations are requested in the primary conversation and proposed as typed, owner-scoped changes. The timeline has no reorder/edit/status controls; proposal review provides the explicit apply or dismiss action with keyboard and touch access.
- Admin operators edit knowledge drafts/cards through forms, not by editing raw AI prose in-place without field structure.

## Accessibility Floor

Behavioral requirements. Visual contrast lives in `DESIGN.md` and shadcn defaults.

- WCAG 2.2 AA target across public, traveler, and admin surfaces.
- All interactive elements reachable by keyboard.
- Sidebar navigation supports keyboard traversal, visible focus, `aria-current` for the active conversation/project route, and accessible names for row menus.
- Focus order follows reading order on chat, source drawer, and admin forms.
- Chat pending, answer completion, save success, and destructive success/failure states announce through polite `aria-live` regions.
- Traveler verification disclosures and selectable source details expose accessible, action-oriented labels, e.g. `Thông tin cần kiểm tra lại` or `Xem nguồn tham khảo`. Source and confidence taxonomy labels are restricted to authorized admin surfaces.
- Color is never the only indicator of a traveler-visible warning, action, or admin metadata label.
- Vietnamese diacritics must remain legible at 200% zoom and common mobile widths.
- Touch targets at least 44px on mobile web.
- Reduced motion disables non-essential transitions in sheets, toasts, and answer reveal.
- Error messages identify the field/action and recovery path.

## Trust, Privacy, And Provenance

This product carries unusual trust load: AI guidance, remembered trip details, user-owned deletion, source confidence, and web fallback must all be understandable.

Rules:

- Never expose operator-only raw source material to travelers.
- When web information may affect a decision, explain in Vietnamese what may have changed and what the traveler should check before acting. Do not label it `external`, `unverified`, or with any internal source/provenance taxonomy.
- Prefer official/provider labels when the source supports it, but still avoid guarantee language.
- Store/display answer provenance from structured source records, not parsed answer text. Persisted entity descriptor labels/summaries may use validated answer ranges, but entity provenance and quick facts must remain bound to stored provenance/safe snapshots.
- The storage notice explains chat/trip detail use before or at first meaningful AI Ask.
- Deletion copy must say normal UI and retrieval use are removed/disabled; audit metadata may remain only if architecture requires it.
- A proposal is a suggestion, not a committed booking, route check, weather check, or current-availability claim. UI copy must name unavailable dynamic information rather than implying it was checked.
- Traveler-facing copy explains what to do, what should be checked, and why. It never exposes system labels, model/provider names, internal status/job/consumer names, source categories, confidence codes, provenance IDs, retrieval policy, audit vocabulary, request IDs, error codes, or implementation diagnostics. This applies equally to normal answers, loading, unavailable, verification, and failure states.
- Trip history shows only the safe structured effect and actor/time. It must not expose raw model output or make a previously applied proposal editable as if it were current state.
- Sensitive-data exclusions are not a UX afterthought: when the assistant appears to extract disallowed sensitive data, do not show it as remembered trip context.

[DECIDED] MVP storage notice copy: `Để hỗ trợ cuộc trò chuyện và kế hoạch chuyến đi, XuyenViet có thể lưu nội dung bạn cung cấp và gửi yêu cầu đến dịch vụ AI đã cấu hình để tạo câu trả lời. Bạn có thể xóa cuộc trò chuyện hoặc dự án chuyến đi bất cứ lúc nào.` The notice includes the link label `Tìm hiểu thêm về quyền riêng tư`, remains informational rather than blocking consent, and must be reviewed if provider processing terms change.

[DECIDED] Deleting a trip project also deletes its linked project chats. The confirmation must name the project and state that linked chats, stored trip context, and normal retrieval use will be removed.

### v6.2 Trip-Aware Planning Addendum

- **Planning modes:** A Trip-scoped answer distinguishes the current saved plan, an explored change, a pending-proposal review, and an unscoped/private question. Current-plan copy represents only applied Trip state. Exploration and pending proposals remain visibly hypothetical and cannot alter the displayed plan.
- **Route coverage:** When a route is partial, ambiguous, unsupported, or has a stale selected path, the answer provides any safe scoped guidance, states the bounded limitation in plain Vietnamese, and offers the relevant clarification, review, or verification action. It never implies end-to-end, live navigation, traffic, closure, or guaranteed route-safety authority.
- **Required planning needs:** If a consequential route, safety, family, vehicle, stop, or constraint need is uncovered, the answer identifies that gap concisely and offers a bounded clarification or verification action. It does not hide the gap behind unrelated recommendations.
- **Persistent Trip conversion:** After a useful unscoped planning answer has current eligible durable context, the shell may show one persistent `Chuyển thành chuyến đi` action projected by the server. It reflects the latest eligible context, may suspend while information is ambiguous or incomplete, and changes no Trip state until the traveler explicitly converts and then applies the resulting proposal.

## Responsive & Platform

XuyenViet is responsive web, not native mobile app for MVP. Mobile web must support planning, asking, reviewing answers, and deleting chats/projects. Admin knowledge review may be usable on mobile but optimized for tablet/desktop.

Desktop behavior:

- Logged-out homepage is centered and does not show the app sidebar.
- Logged-in empty state shows a flat left sidebar plus centered greeting/composer, complete natural-language trip examples, and no right detail panel.
- Active chat uses an edge-to-edge workspace with persistent left sidebar, readable center answer column, and right contextual detail panel only when an answer entity is selected.
- A selected Trip Project uses the same shell with its primary conversation in the center column and a persistent right Trip Workspace for Trip Home and saved plan state. The right workspace expands to proposal review only on request; the center conversation is the exclusive plan-authoring and command surface.
- Long conversation/project lists scroll within the sidebar without moving the main chat composer.

Mobile behavior:

- Navigation, conversation history, trip projects, selected entity details, source details, and trip context use sheets.
- Composer remains reachable without covering the latest answer.
- Long source lists collapse by default.
- The mobile top bar shows menu, active workspace title, and account access without duplicating the full sidebar.
- Admin batch review can defer dense bulk operations to desktop, but core review, suppress/restore, verification, and evidence-validated edit actions should remain functional if feasible.

## Inspiration & Anti-patterns

Lifted patterns:

- ChatGPT/Gemini-style AI shell for familiar conversation management: new chat action, left history, project/workspace grouping, active row, and centered chat workspace.
- ChatGPT/Gemini-style empty state: centered greeting and centered composer before the first prompt.
- Travel-agent answer pattern from the reference direction: compact section chips and inline selectable answer entities that drive a right-side contextual detail panel.
- Travel itinerary cards for scannable day/route summaries.
- Source/provenance drawers from research tools, adapted for consumer readability.
- shadcn/ui component discipline for fast, accessible MVP implementation.

Rejected patterns:

- Map-first UX before Google Maps integration exists. The active mockup's filename is historical; its right region is an inspector, not a map requirement.
- Booking marketplace UI, partner ranking, credit wallet, rewards, referral payout, or affiliate emphasis in MVP.
- Overloaded AI answer footers with generic warning cards, full source detail, or expanded feedback forms by default.
- Technical status, provenance taxonomy, model reasoning, provider diagnostics, request IDs, or implementation error messages in traveler chat.
- Forcing a traveler to decide between chat and trip management before they can explain their trip.
- Gamified trip planning or streak-like usage nudges.
- Admin tools embedded in traveler chat.
- Sidebar-only context changes that are invisible in the main chat header/composer.
- Showing a blank right detail panel in the logged-in empty state.
- Making the right panel map-first before map integration exists.

## Key Flows

### Flow 1 — First AI road-trip question (Lan, Hanoi parent planning after dinner)

1. Lan opens a shared XuyenViet link on her phone.
2. Public homepage explains that XuyenViet helps plan Vietnam road trips and shows a sign-in-gated ask box.
3. She taps `Đăng nhập bằng Google` and completes sign-in.
4. Logged-in empty chat opens with left sidebar, centered greeting, centered composer, starter cards, and no right detail panel.
5. Lan asks: `Gia đình mình có 2 người lớn, 1 bé 7 tuổi, muốn đi Hà Nội đến Huế trong 5 ngày thì nên dừng ở đâu?`
6. The app creates a new active conversation row and shows a pending state while it prepares context and sources.
7. Assistant responds in Vietnamese with a short orientation, a scannable plan, and only the concise follow-up questions needed to improve it. A specific verification disclosure appears only if the advice depends on changeable information.
8. Lan selects a suggested place in the answer.
9. The right detail panel opens with quick facts, related route/hotel/driving notes, and plain-language verification detail only when it helps with a decision.
10. **Climax:** Lan gets a useful plan from one chat and can inspect details without leaving the conversation.

Failure: XuyenViet cannot complete the answer. Lan's message remains visible as a retryable draft; no assistant message is created, and the UI offers a plain-language retry action.

### Flow 2 — Source confidence inspection (Minh, cautious driver checking a stop)

1. Minh asks whether a rest stop near Vinh is good for children.
2. Assistant suggests options and adds a compact, specific note that the stop's current hours or availability should be checked before going.
3. Minh taps `Cần kiểm tra gì?` or `Xem nguồn tham khảo`.
4. The right detail panel opens with safe source titles, links where available, useful checked dates, and an explanation of what should be verified.
5. The traveler can distinguish which option needs verification before acting without needing to learn source or confidence categories.
6. **Climax:** Minh understands which suggestion is safer to trust and which one he should verify by phone or official page before committing.

Failure: A source link is unavailable. The detail panel keeps the practical verification guidance and any safe source label/date, without exposing internal source or confidence fields.

### Flow 3 — Correct remembered trip detail (Hanh, desktop lunch break)

1. Hanh continues a chat about a family trip.
2. Assistant refers to her child as 6 years old.
3. Hanh types: `Con mình 8 tuổi, không phải 6 tuổi.`
4. For an ordinary chat, the system updates only chat context. For a selected Trip Project, it drafts a typed Trip Change Proposal and leaves the saved Trip unchanged.
5. Assistant confirms the understood correction; for a selected Trip it offers `Xem đề xuất và tác động` rather than claiming the plan was updated.
6. Future current-plan answers use the corrected age only after the owner applies that proposal; exploration can use it only as visibly hypothetical context.
7. **Climax:** Hanh corrects the plan naturally through chat without opening settings or a profile form.

Failure: The correction is ambiguous. Assistant asks a concise clarification and does not overwrite context.

### Flow 4 — Delete a trip project (Quang, privacy-conscious returning user)

1. Quang opens the left sidebar and selects trip project `Hè miền Trung`.
2. The main chat header shows that the active context is the `Hè miền Trung` trip project.
3. He opens the project row menu or project settings and chooses delete.
4. Confirmation dialog says what will be removed/disabled from normal UI and future retrieval.
5. Quang confirms `Xóa dự án chuyến đi`.
6. Project disappears from the sidebar and no longer appears as selectable chat context.
7. **Climax:** Quang has a clear privacy-respecting exit from stored planning context.

Failure: Server deletion fails. Project remains visible; error explains retry path without claiming deletion happened.

### Flow 5 — Operator resolves a knowledge recommendation (Mai, owner/operator seeding corridor data)

1. Mai opens the role-protected admin shell on desktop.
2. She submits a source URL about a route stop.
3. Intake item moves through triaging, extraction, independent judging, and relation handling.
4. A qualifying low-risk card becomes active; risky, weak, conflicting, freshness-sensitive, duplicate, or sampled cards receive a prioritized recommendation.
5. Mai opens a recommendation with the current fact, bounded evidence, conditions, states, and reasons. She makes an evidence-validated edit, suppresses a duplicate, or records verification as appropriate.
6. The card state and search eligibility update atomically; seed progress counts only active evidence-grounded cards.
7. **Climax:** XuyenViet's answer quality improves through evidence-grounded local knowledge and targeted operator intervention, without raw source material leaking to travelers.

Failure: Extraction fails. Mai sees recoverable failure and can retry or paste text; no active card is created automatically.

### Flow 6 — Referral link sign-in without reward UI (Nam, invited by a friend)

1. Nam opens a link containing a referral code.
2. Public entry behaves normally; no reward, points, ranking, payout, or credit promise is shown.
3. Nam signs in with Google.
4. Server captures valid referral attribution if the code is valid.
5. Nam lands in AI Ask like any new user.
6. **Climax:** Attribution is preserved for future analysis without introducing MVP scope creep or user-facing reward liability.

Failure: Referral code invalid. Sign-in still works normally and no reward/error UI is shown.

### Flow 7 — Return to a trip project from the sidebar (Vy, planning across several evenings)

1. Vy signs in on desktop after previously planning `Tết đi Đà Lạt`.
2. The AI planning shell opens with the left sidebar visible.
3. Under `Dự án chuyến đi`, she selects `Tết đi Đà Lạt`.
4. The main chat header changes to show the active trip project, and the assistant uses that trip context before ordinary chat history.
5. Vy asks: `Thêm điểm dừng nào phù hợp cho bé 5 tuổi?`
6. Assistant answers with family-aware suggestions and a specific verification disclosure only if one of the recommendations depends on changeable information.
7. **Climax:** Vy understands she is continuing the trip project, not starting an unrelated chat, and the sidebar makes that context persistent.

Failure: The project was deleted from another tab. The sidebar removes or marks it unavailable after refresh, and the main area shows a safe not-found/permission message without exposing private data.

### Flow 8 — Empty logged-in start (Bao, first-time signed-in user)

1. Bao signs in successfully but has not asked XuyenViet anything yet.
2. The app shows the left sidebar with `Hỏi XuyenViet` and an empty-history message.
3. The center shows a large Vietnamese greeting, a centered composer with a complete natural-language example, and starter prompts for real trip situations.
4. No right detail panel is shown because there is no answer entity to inspect yet.
5. Bao types a route question in the centered composer.
6. **Climax:** Bao sees a calm ChatGPT/Gemini-like starting point that makes the first action obvious without showing empty panels.

Failure: Bao tries to submit an empty prompt. The composer remains focused and shows a validation message; no conversation, provider call, or usage event is created.

### Flow 9 — Inspect selected answer detail (Trang, comparing a stop before saving it)

1. Trang receives an answer with section chips and inline selectable entities.
2. She selects `Asia Park` inside the answer.
3. The right detail panel opens with the selected title, short summary, quick facts, route impact, nearby stay note, driving note, and source chips.
4. For a selected Trip, Trang chooses `Dùng trong kế hoạch` to draft and review a typed Trip Change Proposal; the panel states that the saved plan changes only after `Áp dụng`. In an ordinary chat, the action may save only a supported chat-local note and never creates or mutates a Trip. Closing the panel returns focus to the answer.
5. **Climax:** Trang can inspect detail without losing the chat context or opening a separate page.

Failure: Detail data is unavailable. The panel shows a compact unavailable state and preserves the original answer text.

### Flow 10 — Turn an AI suggestion into a confirmed trip plan (Linh, planning a family road trip on desktop)

1. Linh opens `Hè miền Trung` from `Chuyến đi` in the sidebar.
2. Trip Home shows the next planning focus and a compact timeline: Huế departure, Đà Nẵng stay, and several open ideas.
3. She asks in the primary conversation: `Ngày thứ hai nên đi thế nào để bé không mệt?`
4. The assistant replies with guidance and a proposal card: move the departure earlier, add a rest stop, and keep the accommodation unchanged.
5. The proposal card explains the impact in a before/after summary and offers `Áp dụng`, `Xem phương án khác` when supplied, and `Giữ kế hoạch`.
6. Linh reviews the affected leg and selects `Áp dụng`.
7. The timeline updates only after successful save; Trip Home changes to the next relevant focus and plan history records the applied proposal.
8. **Climax:** Linh can use AI to shape a real plan while retaining clear control over every persistent change.

Failure: Linh applied a newer proposal in another tab before applying an earlier one. The earlier proposal reports that the plan changed, applies nothing, and offers to refresh the suggestion against the current plan through the primary conversation.

## Open Questions

| Question | Impact | Owner / Next Step |
|---|---|---|
| Exact privacy-policy wording for AI Gateway-backed memory/chat processing | Public onboarding and storage notice copy | Product/legal before public launch |
| Whether admin review is required to be fully mobile-optimized in MVP | Admin layout scope | Sprint planning/story scoping |
| Final UI system choice if not shadcn/ui | Component implementation contract | Confirm during app foundation story |
| Sidebar trip project selection behavior | Resolved: the AI Ask route owns URL-selected conversation/project state and server-loaded shell data | Architecture AD-24 |
| Selected detail-panel state | Resolved: descriptor selection is transient derived UI state; desktop panel and mobile sheet share it | Architecture AD-19, AD-20, AD-24 |
| Proposal conflict presentation | Resolved: preserve proposal, apply nothing, and request refresh rather than overwrite manual state | Architecture AD-30 |
