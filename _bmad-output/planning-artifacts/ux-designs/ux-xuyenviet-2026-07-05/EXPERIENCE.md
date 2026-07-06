---
name: XuyenViet
status: draft
project: xuyenviet
created: 2026-07-05
updated: 2026-07-05
sources:
  - ../../prds/prd-xuyenviet-2026-07-04/prd.md
  - ../../architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - ../../epics.md
  - ../../implementation-readiness-report-2026-07-05.md
  - ../../sprint-change-proposal-2026-07-05-ai-usage-referral.md
---

# XuyenViet — Experience Spine

> Fast-path UX contract for responsive web public MVP. Paired with `DESIGN.md`. Spines win on conflict with future mockups or implementation shortcuts.

## Foundation

Responsive web app for consumer MVP. Primary runtime assumption: Next.js App Router, React, shadcn/ui, Tailwind, and PostgreSQL-backed auth/session data as defined by architecture. `DESIGN.md` is the visual identity reference; this document owns information architecture, behavior, states, flows, accessibility, and interaction contracts.

Primary audience: Vietnamese road-trip travelers planning by car, initially focused on Hanoi-to-HCMC corridor use cases. Secondary audience: owner/admin/operator managing travel knowledge.

[ASSUMPTION] UX copy is Vietnamese-first for traveler surfaces. Admin/operator surfaces may use Vietnamese labels with technical metadata names where useful during MVP.

[ASSUMPTION] The MVP has no Google Maps integration. Route and place guidance is text/card-based, with map integration explicitly deferred.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Public entry | Root route, referral link | Explain value, show Google sign-in path, preserve referral parameter silently |
| Sign-in / auth callback states | Public entry, protected-route redirect | Google sign-in, safe error handling, post-auth continuation |
| AI Ask chat | Primary app nav after auth | Vietnamese road-trip conversation with structured AI answers |
| Chat sessions | AI Ask sidebar/sheet | Create, revisit, continue, and delete user-owned conversations |
| Trip projects | App nav / chat context selector | Focus planning around a durable trip and reuse trip context |
| Trip project detail | Trip project list / selected context | Show trip context, linked chats, correction/delete affordances |
| Source detail drawer | Answer source section / source chip | Show source title, type, URL when available, collected/checked date, confidence, freshness |
| Account/privacy | Avatar menu / storage notice | Explain stored chat/trip details, deletion entry points, sign out |
| Admin shell | Role-protected nav | Separate operator/admin workspace |
| Knowledge intake | Admin shell | Submit URL, text, copied post, screenshot metadata for AI extraction |
| Draft review queue | Admin shell / intake success | Review AI-prepared knowledge drafts |
| Knowledge card detail | Draft queue / approved list | Edit, approve, archive, inspect source provenance |
| Seed progress | Admin shell | Track 100 approved Hanoi-to-HCMC corridor knowledge items |
| Feedback / quality signal | Assistant answer footer | Capture usefulness rating and quality flags without interrupting planning |

Responsive navigation:

| Breakpoint | Behavior |
|---|---|
| Desktop `lg+` | Left app navigation visible. Chat/session list may sit left of chat. Optional right panel shows current trip context or source details. |
| Tablet `md` | Navigation compresses. Chat remains central. Context/source panels open as sheets. |
| Mobile `< md` | Top bar + sheet navigation. Chat composer pinned near bottom. Source detail and session list open full-height sheets. |

Modal stacks one level deep. Use sheets for drill-in context on mobile. Do not open dialog on top of dialog.

## Voice and Tone

Microcopy is Vietnamese-first, practical, and calm. Brand posture lives in `DESIGN.md`.

| Do | Don't |
|---|---|
| `Bạn muốn đi đâu, đi mấy ngày, và đi cùng ai?` | `Hãy nhập đầy đủ thông tin để hệ thống hoạt động chính xác.` |
| `Mình có thể gợi ý trước, rồi hỏi thêm vài chi tiết.` | `Không đủ dữ liệu.` |
| `Thông tin này có thể thay đổi. Kiểm tra lại trước khi đặt dịch vụ.` | `Cảnh báo: dữ liệu không đáng tin cậy.` |
| `Nguồn cộng đồng, chưa xác minh` | `Nguồn xấu` |
| `Xóa cuộc trò chuyện này? Nội dung sẽ không còn dùng trong câu trả lời.` | `Bạn có chắc không?` |
| `Không tìm thấy nguồn phù hợp. Mình sẽ nói rõ phần nào là suy luận chung.` | `Không có dữ liệu.` |

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
| Public entry hero | Root route | Explains AI road-trip assistant value in one screen. Primary CTA is Google sign-in. If `ref` exists, preserve it silently through auth. |
| Google sign-in button | Public entry, protected-route gate | Opens OAuth flow. Failure returns safe message without exposing provider details or secrets. |
| Protected-route gate | AI Ask/admin | If unauthenticated, redirect or block before loading chat/trip/admin data. No AI call or conversation is created. |
| Chat composer | AI Ask | Accepts Vietnamese free text. Empty/invalid submission blocked client-side and server-side. Submit disabled while sending unless retrying failed draft. |
| Assistant answer | Chat | Structured sections: suggested plan/options, rationale, practical tips, warnings, sources, uncertainty, next steps. Sections appear only when relevant. |
| Follow-up questions | Assistant answer footer | 1-3 concise questions. Tappable suggestions may prefill composer; user can edit before sending. |
| Source summary row | Assistant answer | Shows compact chips/counts by source category. Opens source detail drawer. Does not expose raw operator-only material. |
| Source detail drawer | Answer/source chips | Lists each source with title/label, type, URL when available, collected/checked date, confidence, freshness-sensitive flag. |
| Storage notice | First AI Ask / account privacy | Informs users chat/trip details may be stored for current session/project. Link to details. Must not block asking unless legal policy later requires consent. |
| Chat/session row | Session list | Opens conversation. Row menu contains rename if implemented, delete. Delete requires confirmation. |
| Trip context selector | AI Ask | Shows whether user is in ordinary chat or selected trip project. Switching project changes context priority visibly. |
| Context correction hint | AI Ask / trip detail | If extracted context changes, show small confirmation-style note when useful: `Mình đã cập nhật: con 8 tuổi.` |
| Delete confirmation | Chat/trip project | Names what will be removed or disabled from normal UI/retrieval. Requires explicit destructive click. |
| Admin card form | Knowledge card detail | Structured edit form. Save draft, approve, archive are distinct actions. Approval cannot be accidental. |
| Intake submitter | Knowledge intake | Supports URL, raw text, copied post content, and screenshot/file metadata. Failed extraction is recoverable and creates no approved card. |
| Draft review queue | Admin | Filter by source, type, route/location, status, confidence, freshness. Operators can edit, reject, keep draft, approve. |
| Usefulness rating | Assistant answer footer | Lightweight positive/negative or rating action after answer. Optional comment only after rating; never blocks chat. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold public entry | Public entry | Value proposition, sample prompt, Google sign-in CTA. No app data requested. |
| Referral link present | Public entry/sign-in | No reward UI. Preserve attribution through sign-in. If invalid, continue normally. |
| Unauthenticated protected route | AI Ask/admin | Redirect to sign-in or show gate. State: `Đăng nhập để hỏi AI.` |
| Auth failure | Sign-in | Safe message, retry button. No secret/provider diagnostic. |
| First AI Ask empty | AI Ask | Empty state invites a road-trip question. Provide example prompts for Vietnam road trips. |
| Sending message | AI Ask | Pending state in chat, composer disabled or guarded against duplicate submit. |
| Long AI response | AI Ask | Progress copy after delay: `Mình đang kiểm tra ngữ cảnh và nguồn phù hợp...` Do not imply completion. |
| AI provider failure | AI Ask | Keep user draft. Show retry. Do not create misleading assistant message. |
| No curated knowledge | Assistant answer | Say curated XuyenViet knowledge was not found and whether web/general reasoning was used. |
| Freshness-sensitive answer | Assistant answer | Show freshness warning near relevant section and in source details. |
| Conflicting sources | Assistant answer | State conflict plainly and ask user to verify; prefer official/provider sources when available. |
| Empty chat history | Chat sessions | Message + action to start first chat. |
| Deleted chat/project | Chat/trips | Remove from normal UI and retrieval. Show brief success toast. |
| Unauthorized data access | Any owned resource | Deny server-side. Show generic not-found/permission message without exposing existence details. |
| Admin no role | Admin | Deny route server-side; no admin navigation shown to normal travelers. |
| Draft extraction pending | Admin intake/review | Status row: pending, reading, extracted, needs review, failed, duplicate, rejected, approved. |
| Extraction failed | Admin intake | Error reason safe for operator. Retry or edit source. No approved knowledge created. |
| 100-card seed incomplete | Seed progress | Count approved corridor items and remaining gap. Show distribution gaps by type/route. |

## Interaction Primitives

- Click/tap to act. Hover-only controls are forbidden on mobile.
- `Enter` submits composer when focus is in single-line prompt mode; `Shift+Enter` inserts newline when multiline is enabled.
- `Esc` closes the topmost sheet, drawer, popover, or dialog.
- `/` may focus chat composer on desktop when no input is active.
- Source chips and warning callouts must be keyboard-focusable if they open details.
- Destructive actions require explicit confirmation; no swipe-to-delete on web MVP.
- Infinite scroll is avoided for admin review queues in MVP; use pagination or explicit load-more to preserve review state.
- Generated AI answer text is not editable by the traveler; the user corrects facts by sending another message.
- Admin operators edit knowledge drafts/cards through forms, not by editing raw AI prose in-place without field structure.

## Accessibility Floor

Behavioral requirements. Visual contrast lives in `DESIGN.md` and shadcn defaults.

- WCAG 2.2 AA target across public, traveler, and admin surfaces.
- All interactive elements reachable by keyboard.
- Focus order follows reading order on chat, source drawer, and admin forms.
- Chat pending, answer completion, save success, and destructive success/failure states announce through polite `aria-live` regions.
- Source chips expose accessible labels, e.g. `Nguồn curated`, `Nguồn cộng đồng chưa xác minh`.
- Color is never the only source/confidence indicator; labels are always present.
- Vietnamese diacritics must remain legible at 200% zoom and common mobile widths.
- Touch targets at least 44px on mobile web.
- Reduced motion disables non-essential transitions in sheets, toasts, and answer reveal.
- Error messages identify the field/action and recovery path.

## Trust, Privacy, And Provenance

This product carries unusual trust load: AI guidance, remembered trip details, user-owned deletion, source confidence, and web fallback must all be understandable.

Rules:

- Never expose operator-only raw source material to travelers.
- Label web-search information as external/unverified unless reviewed into approved knowledge.
- Prefer official/provider labels when the source supports it, but still avoid guarantee language.
- Store/display answer provenance from structured source records, not parsed answer text.
- The storage notice explains chat/trip detail use before or at first meaningful AI Ask.
- Deletion copy must say normal UI and retrieval use are removed/disabled; audit metadata may remain only if architecture requires it.
- Sensitive-data exclusions are not a UX afterthought: when the assistant appears to extract disallowed sensitive data, do not show it as remembered trip context.

[OPEN QUESTION] Exact privacy-policy wording for AI Gateway-backed memory/chat processing still needs legal/product approval before public onboarding.

[OPEN QUESTION] Story 3.7 leaves linked project chat delete-vs-detach behavior open. Story creation should decide the user-facing deletion copy before implementation.

## Responsive & Platform

XuyenViet is responsive web, not native mobile app for MVP. Mobile web must support planning, asking, reviewing answers, and deleting chats/projects. Admin knowledge review may be usable on mobile but optimized for tablet/desktop.

Desktop behavior:

- Persistent nav and session/project list.
- Chat column remains readable, not full-bleed.
- Source/trip context can appear in a right panel.

Mobile behavior:

- Navigation, sessions, source details, and trip context use sheets.
- Composer remains reachable without covering the latest answer.
- Long source lists collapse by default.
- Admin batch review can defer dense bulk operations to desktop, but core approve/reject/edit should remain functional if feasible.

## Inspiration & Anti-patterns

Lifted patterns:

- ChatGPT/Gemini-style session list for familiar conversation management.
- Travel itinerary cards for scannable day/route summaries.
- Source/provenance drawers from research tools, adapted for consumer readability.
- shadcn/ui component discipline for fast, accessible MVP implementation.

Rejected patterns:

- Map-first UX before Google Maps integration exists.
- Booking marketplace UI, partner ranking, credit wallet, rewards, referral payout, or affiliate emphasis in MVP.
- Overloaded AI answer footers with every source detail expanded by default.
- Gamified trip planning or streak-like usage nudges.
- Admin tools embedded in traveler chat.

## Key Flows

### Flow 1 — First AI road-trip question (Lan, Hanoi parent planning after dinner)

1. Lan opens a shared XuyenViet link on her phone.
2. Public entry explains that XuyenViet helps plan Vietnam road trips and asks her to sign in before AI Ask.
3. She taps `Đăng nhập bằng Google` and completes sign-in.
4. AI Ask opens with an empty prompt: `Bạn đang muốn đi đâu? Ví dụ: Hà Nội đi Đà Nẵng 7 ngày cùng gia đình.`
5. Lan asks: `Gia đình mình có 2 người lớn, 1 bé 7 tuổi, muốn đi Hà Nội đến Huế trong 5 ngày thì nên dừng ở đâu?`
6. The app shows a pending state while it prepares context and sources.
7. Assistant responds in Vietnamese with suggested route options, child-aware pacing, practical stops, warnings, source/confidence summary, and 2 follow-up questions.
8. **Climax:** Lan sees a useful first plan before filling any form, plus a clear note that some info should be verified before booking. She taps one follow-up question to refine the route.

Failure: AI provider fails. Lan's message remains visible as retryable draft; no assistant message is created.

### Flow 2 — Source confidence inspection (Minh, cautious driver checking a stop)

1. Minh asks whether a rest stop near Vinh is good for children.
2. Assistant suggests options and shows compact chips: `Curated`, `Community`, `Freshness-sensitive`.
3. Minh taps the source row.
4. Source detail drawer opens with source titles, source type, URL where available, collected/checked date, confidence label, and freshness warning.
5. One source is community/unverified; one source is official/provider.
6. **Climax:** Minh understands which suggestion is safer to trust and which one he should verify by phone or official page before committing.

Failure: Source URL missing. The drawer still shows source label/type/date/confidence and says URL is unavailable rather than hiding the source.

### Flow 3 — Correct remembered trip detail (Hanh, desktop lunch break)

1. Hanh continues a chat about a family trip.
2. Assistant refers to her child as 6 years old.
3. Hanh types: `Con mình 8 tuổi, không phải 6 tuổi.`
4. The system treats it as a correction and updates the relevant chat or selected trip project context.
5. Assistant confirms briefly: `Mình đã cập nhật: bé 8 tuổi.`
6. Future answer pacing and activity suggestions use the corrected age.
7. **Climax:** Hanh corrects the plan naturally through chat without opening settings or a profile form.

Failure: The correction is ambiguous. Assistant asks a concise clarification and does not overwrite context.

### Flow 4 — Delete a trip project (Quang, privacy-conscious returning user)

1. Quang opens Trip projects and selects `Hè miền Trung`.
2. He opens project settings and chooses delete.
3. Confirmation dialog says what will be removed/disabled from normal UI and future retrieval.
4. Quang confirms `Xóa dự án chuyến đi`.
5. Project disappears from list and no longer appears in context selector.
6. **Climax:** Quang has a clear privacy-respecting exit from stored planning context.

Failure: Server deletion fails. Project remains visible; error explains retry path without claiming deletion happened.

### Flow 5 — Operator approves extracted knowledge (Mai, owner/operator seeding corridor data)

1. Mai opens the role-protected admin shell on desktop.
2. She submits a source URL about a route stop.
3. Intake item moves through reading/extracted/needs review.
4. Draft review shows proposed knowledge cards with title, type, route/location, summary, source, collected date, confidence, and freshness flag.
5. Mai edits one draft, rejects a duplicate, and approves a useful card.
6. Approved card becomes eligible for traveler retrieval; seed progress count updates.
7. **Climax:** XuyenViet's answer quality improves through human-approved local knowledge, without raw source material leaking to travelers.

Failure: Extraction fails. Mai sees recoverable failure and can retry or paste text; no approved card is created automatically.

### Flow 6 — Referral link sign-in without reward UI (Nam, invited by a friend)

1. Nam opens a link containing a referral code.
2. Public entry behaves normally; no reward, points, ranking, payout, or credit promise is shown.
3. Nam signs in with Google.
4. Server captures valid referral attribution if the code is valid.
5. Nam lands in AI Ask like any new user.
6. **Climax:** Attribution is preserved for future analysis without introducing MVP scope creep or user-facing reward liability.

Failure: Referral code invalid. Sign-in still works normally and no reward/error UI is shown.

## Open Questions

| Question | Impact | Owner / Next Step |
|---|---|---|
| Exact privacy-policy wording for AI Gateway-backed memory/chat processing | Public onboarding and storage notice copy | Product/legal before public launch |
| Trip project deletion behavior for linked chats: delete or detach | Story 3.7 UX copy and implementation | Decide during `bmad-create-story` validation |
| Whether admin review is required to be fully mobile-optimized in MVP | Admin layout scope | Sprint planning/story scoping |
| Final UI system choice if not shadcn/ui | Component implementation contract | Confirm during app foundation story |
