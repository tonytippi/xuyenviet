# Proposal: Chat-First Trip Companion UX

**Status:** Proposed
**Date:** 2026-08-04
**Decision requested:** Approve a chat-first UX revision so XuyenViet feels like a simple travel companion rather than a technical planning or provenance interface.

## Summary

XuyenViet should begin with one natural-language conversation, not a choice between "chat" and "create a trip." The assistant helps first, learns context through the conversation, and only suggests saving or continuing a Trip Project when that is useful and sufficiently clear.

The primary chat should borrow the simplicity of ChatGPT: readable messages, a natural composer, a small number of useful follow-ups, and minimal persistent UI. Technical information about provenance, uncertainty, freshness, and feedback remains available, but moves out of the default reading path.

This proposal preserves the current planning safety model:

- Chat remains the only authoring surface for a plan.
- A Trip Project is a user-owned, saved planning context rather than a separate mode the user must understand first.
- The assistant never creates a Trip Project or mutates a saved plan without explicit user confirmation.
- Plan changes remain typed proposals that the owner explicitly applies or dismisses.

## Problem

The current authenticated chat gives system and audit information too much visual weight. Per-answer blocks such as `Cảnh báo cần kiểm tra`, `Nguồn và độ tin cậy`, general-reasoning labels, and the full usefulness-rating card make a simple travel exchange read like a compliance report.

The current shell also exposes internal distinctions before the user has a reason to understand them:

- A user must infer the difference between an ordinary chat and a Trip Project.
- The sidebar makes project management appear as a separate task rather than a benefit that follows from a useful conversation.
- A user cannot easily predict when the system will preserve trip context or how to ask outside the current trip.
- The Trip Workspace presents its data blocks in a long stack rather than prioritizing the immediate decision.

The result is a product that is technically explainable but harder to understand and use at the moment a traveler simply wants to describe a trip.

## Product Principles

1. **Start with the trip, not the product model.** The user describes what they want in Vietnamese natural language. They do not need to choose a mode, fill a setup form, or learn the term "Trip Project."
2. **Help before asking for structure.** The assistant gives useful initial guidance and asks only the smallest number of follow-up questions needed to improve it.
3. **Suggest durable context only when it helps.** Saving a trip or using an existing trip is an assistant recommendation with a clear benefit and an explicit choice.
4. **Keep the conversation calm and readable.** The default answer surface prioritizes conclusion, options, practical next steps, and an optional contextual action.
5. **Disclose trust detail progressively.** Verify-before-action guidance remains visible when relevant, but provenance internals, raw source categorization, and general-reasoning labels are not default answer content.
6. **Never imply automatic plan changes.** AI suggestions and saved plan state remain visually and behaviorally distinct.

## Proposed Experience

### 1. One Natural-Language Entry Point

The logged-in empty state remains a centered, low-chrome chat entry. It does not ask the traveler to select `Trò chuyện thường` or `Tạo chuyến đi`.

Suggested copy:

```text
Bạn muốn đi đâu, cùng ai, khi nào?

Ví dụ: Nhà mình đi ô tô từ Hà Nội vào Huế 5 ngày cuối tháng 9,
có bé 5 tuổi, muốn đi chậm và nghỉ nhiều.
```

Starter prompts should demonstrate complete, natural requests rather than expose product functions:

- `Gia đình có trẻ nhỏ đi Hà Nội - Huế 5 ngày bằng ô tô`
- `Cuối tuần đi từ TP.HCM đến Đà Lạt, 2 người`
- `Tìm cung đường xe máy Hà Giang dễ đi hơn`
- `Ăn gì ở Hội An nếu chỉ ghé một buổi tối?`

The send action uses a neutral action label such as `Gửi` or an icon-only send button. The UI must not promise that sending always creates a trip.

### 2. A Companion-Style Assistant Response

The default assistant answer uses normal conversation typography and lightweight Markdown hierarchy. It has no mandatory outer card, no repeated warning header, and no default provenance block.

Recommended answer order:

1. Short conclusion or orientation.
2. A scannable suggested plan, options, or practical guidance.
3. One to three concise questions or tappable replies when more context materially improves the answer.
4. A contextual trip action only when appropriate.
5. A compact verify-before-action disclosure only when relevant.

Example:

```text
Mình sẽ lên một nhịp đi thoải mái, ưu tiên không lái xe quá lâu.

Gợi ý ban đầu:
- Ngày 1: Hà Nội -> Vinh hoặc khu vực lân cận.
- Ngày 2: Đi tiếp vào Huế, thêm một điểm nghỉ cho gia đình.
- Ngày 3-4: Khám phá Huế với lịch nhẹ.
- Ngày 5: Dự phòng hoặc bắt đầu quay về.

Để sát hơn, gia đình mình có trẻ nhỏ không và dự định đi vào thời gian nào?

[Có, bé 5 tuổi] [Đi cuối tháng 9]
```

Quick replies prefill the composer and remain editable before sending. They are only rendered when they answer the assistant's immediate question; they are not a generic feature menu.

### 3. Assistant-Suggested Trip Creation

The assistant suggests saving a Trip Project only after the conversation has enough durable travel context. It must not silently create one.

Strong signals include one of the following:

- A clear origin and destination plus a duration or date range.
- A multi-stop route or requested itinerary.
- Family, vehicle, budget, driving tolerance, or other constraints that should be remembered.
- A request to plan, revise, compare, or track an itinerary over time.

The suggestion appears as a compact conversational message, not a workflow modal:

```text
Mình đã có đủ thông tin để theo dõi hành trình này cho bạn:
Hà Nội -> Huế · 5 ngày · đi ô tô.

Nếu lưu thành chuyến đi, mình sẽ nhớ các ưu tiên của gia đình
và luôn đề xuất trước khi cập nhật kế hoạch.

[Lưu chuyến đi này] [Chưa cần]
```

`Lưu chuyến đi này` creates the project from information already confirmed or extracted in the conversation. It may ask one concise clarifying question if a safe project title or minimal route context cannot be derived. It must not open a long form.

`Chưa cần` dismisses this suggestion for the current topic. The assistant may only raise it again after materially new planning context arrives or the user explicitly asks to save the trip.

After creation, the assistant confirms the change in ordinary language:

```text
Đã lưu chuyến Hà Nội -> Huế.
Từ giờ mình sẽ dùng các ưu tiên đã lưu và chỉ thay đổi kế hoạch khi bạn duyệt.
```

### 4. Assistant-Suggested Continuation in an Existing Trip

When an unscoped conversation plausibly relates to an owned Trip Project, the assistant offers context rather than automatically attaching the conversation.

For one high-confidence match:

```text
Nội dung này khá khớp với chuyến Hè miền Trung của bạn.
Bạn muốn mình dùng kế hoạch và các ưu tiên đã lưu chứ?

[Tiếp tục trong Hè miền Trung] [Hỏi riêng lần này]
```

For multiple plausible matches:

```text
Mình thấy câu hỏi này có thể liên quan đến vài chuyến đi.
Bạn muốn xem trong chuyến nào?

[Hè miền Trung] [Đà Lạt cuối tuần] [Hỏi riêng lần này]
```

For a weak match, the assistant asks a natural question instead of making an action suggestion:

```text
Bạn đang hỏi cho chuyến Hè miền Trung phải không?
```

Selecting an existing trip moves the conversation to its primary conversation using the existing URL-owned shell model. `Hỏi riêng lần này` preserves the ordinary conversation and must not inject project constraints into later answers.

### 5. Clear, Escapable Trip Context

When the current conversation is scoped to a Trip Project, show only a compact context indicator near the composer:

```text
Đang cùng bạn lên kế hoạch cho Hè miền Trung · Đổi
```

The composer placeholder changes to:

```text
Hỏi hoặc yêu cầu điều chỉnh kế hoạch này...
```

`Đổi` provides two explicit choices:

- `Hỏi ngoài chuyến đi này`
- `Chọn chuyến đi khác`

If a new message is clearly unrelated to the active trip, the assistant asks whether the traveler wants a private answer or continued trip context. It must not silently apply family, route, or constraint data to unrelated requests.

### 6. Simplify Provenance, Warnings, and Feedback

The current default answer rendering must no longer show a large `Cảnh báo cần kiểm tra` block, `Nguồn và độ tin cậy` section, general-reasoning label, or full feedback card for every assistant response.

#### Verify-before-action guidance

For ordinary planning guidance, show one quiet line at the end of the answer only when needed:

```text
Giờ mở cửa, giá và tình trạng đường có thể thay đổi. Mình sẽ nhắc bạn kiểm tra khi cần.
```

For a time-sensitive or consequential fact, make the guidance specific and offer a disclosure control:

```text
Giờ mở cửa và tình trạng phòng cần kiểm tra lại trước khi đặt. [Cần kiểm tra gì?]
```

Open disclosure content uses action-oriented language:

```text
Thông tin cần kiểm tra trước khi đi
- Giờ mở cửa, giá vé hoặc tình trạng hoạt động.
- Tình trạng đường và thời tiết nếu ngày đi đã gần.
- Phòng trống hoặc điều kiện đặt chỗ nếu bạn chọn nơi ở cụ thể.

[Xem nguồn tham khảo]
```

The source detail remains backed by persisted provenance and preserves all existing safety and owner-scoping rules. It may expose source title, source category, URL, collected/checked date, confidence, and freshness in the detail drawer. Technical copy such as `Suy luận tổng quát của AI`, `Nguồn và độ tin cậy`, or `Không phải nguồn đã xác minh` is replaced on traveler surfaces by plain-language explanation of what should be checked and why.

Prominent warning treatment remains permitted only for actionable safety, access, legal, booking, or time-sensitive failures. It must state the concrete risk and recovery action, rather than communicate generic uncertainty.

#### Feedback

Replace the full-width `Câu trả lời này hữu ích không?` card with lightweight answer-footer actions:

```text
[Hữu ích] [Chưa đúng ý] [More]
```

The controls may be compact icon buttons with accessible labels. Selecting negative feedback optionally reveals a short prompt and targeted choices such as `Chưa đúng nhu cầu`, `Thiếu chi tiết`, or `Khó thực hiện`. Feedback never blocks the composer or the next message.

### 7. Reframe the Sidebar

The sidebar remains useful for return navigation, but must not force a mode decision at the start.

Recommended hierarchy:

```text
XuyenViet

[Hỏi XuyenViet]

CHUYẾN ĐI CỦA BẠN
Hè miền Trung
Huế -> Đà Nẵng · 12-16/7 · Cần xem 1 đề xuất

Đà Lạt cuối tuần
2-4/9 · Đang lên ý tưởng

CUỘC TRÒ CHUYỆN GẦN ĐÂY
Ăn gì ở Hội An?
Điểm dừng nghỉ gần Vinh
```

`Hỏi XuyenViet` starts an ordinary, unscoped conversation. The existing `Trò chuyện thường` and `Quản lý chuyến đi` terminology should not be primary visible navigation labels.

A small, secondary create-trip affordance may remain beside `Chuyến đi của bạn` for returning users who explicitly want to start fresh. It does not replace the assistant-suggested creation flow and must use friendly copy such as `Bắt đầu chuyến đi mới`.

Each trip row includes concise context and a useful state, such as `Cần hoàn thiện`, `Có đề xuất chờ duyệt`, or `Đang lên ý tưởng`. It must not expose internal persistence terminology.

### 8. Restructure the Trip Workspace Around Decisions

The Trip Workspace remains read-oriented and separate from the primary conversation. It should prioritize what the traveler needs to do, not render every projection in one long stack.

Desktop order:

```text
Hè miền Trung
Huế -> Đà Nẵng · 12-16/7

CẦN XỬ LÝ
Khởi hành Huế sớm hơn 2 giờ
Giảm thời gian di chuyển liên tục cho bé.
[Xem đề xuất]

KẾ HOẠCH
Ngày 2 · Huế -> Đà Nẵng
- Khởi hành · Dự kiến
- Nghỉ giữa chặng · Ý tưởng
- Nơi ở Đà Nẵng · Đã chốt
[Xem toàn bộ kế hoạch]

THÔNG TIN ĐÃ LƯU
Gia đình 2 người lớn, 1 trẻ em · Ô tô
Lái tối đa 4 giờ/chặng
[Xem ràng buộc] [Lịch sử thay đổi]
```

- `Cần xử lý` presents exactly one focus from the existing deterministic Trip Home model.
- `Kế hoạch` initially shows the day or leg related to that focus rather than forcing the traveler to parse the full timeline.
- `Thông tin đã lưu` keeps constraints visible but secondary and uses an on-demand history surface. One recent-change sentence may appear inline when it helps orient the traveler.
- The workspace continues to have no manual plan editor, state toggle, reorder control, map-first view, booking widget, or separate composer.

On mobile, the workspace sheet uses three tabs: `Cần làm`, `Kế hoạch`, and `Thông tin`. Only one tab panel is visible at a time. This prevents a single long sheet from mixing decisions, plan rows, constraints, and audit history.

### 9. Proposal Cards Use Decision Language

A pending proposal must name the actual decision, not repeat the generic label `Đề xuất thay đổi kế hoạch` as its primary heading.

```text
ĐỀ XUẤT CHO NGÀY 2

Khởi hành Huế sớm hơn 2 giờ

Gia đình có thêm thời gian nghỉ giữa chặng và vẫn giữ buổi chiều
ở Đà Nẵng linh hoạt.

THAY ĐỔI
Khởi hành: 12:30 -> 10:30
Điểm nghỉ: Thêm một điểm nghỉ phù hợp cho trẻ nhỏ
Nơi ở: Giữ nguyên nơi ở Đà Nẵng

[Áp dụng vào kế hoạch] [Giữ kế hoạch hiện tại]
```

`Xem phương án khác` appears only when it opens real alternatives. Unsupported or disabled alternative controls must not render.

## Functional Requirements

1. The logged-in empty chat accepts a natural-language trip request without requiring a chat/project mode choice.
2. The assistant can surface editable quick replies only when a concise answer to its immediate follow-up would advance planning.
3. The assistant can propose, but never automatically create, a Trip Project after durable planning context is detected.
4. The user can accept or decline the creation suggestion without losing the current chat draft or answer.
5. The assistant can propose use of one or more owned existing projects for an unscoped question, but must not attach context without an explicit user selection.
6. A project-scoped conversation visibly identifies its context and offers a direct way to ask outside the project or switch projects.
7. The default answer surface does not render full provenance, generic reasoning labels, large generic warnings, or expanded feedback forms unless the user requests details or a concrete risk requires prominence.
8. Source/provenance detail remains available from a compact, progressive-disclosure entry point and remains derived from persisted provenance records only.
9. Freshness-sensitive, safety-sensitive, booking, route, legal, or access-critical claims show concise, specific verification guidance close to the affected recommendation.
10. Feedback remains available after every completed answer without displacing the composer or interrupting planning.
11. The sidebar distinguishes saved trips from recent unscoped conversations using traveler-facing labels and concise useful status.
12. The workspace presents one actionable focus, a relevant plan slice, and on-demand trip information; it remains read-only.
13. Pending change proposals use a concrete decision title, bounded impact, and explicit apply/dismiss actions. A plan mutation still requires owner confirmation.
14. All revised controls retain keyboard access, visible focus, accessible names, live announcements for async state, and mobile targets of at least 44px where touch actions are exposed.

## Non-Goals

- No automatic trip creation, automatic context attachment, or automatic plan mutation.
- No new map, route provider, weather provider, booking, availability, budget, checklist, collaboration, or location-tracking feature.
- No replacement of persisted provenance, source-detail, annotation, safety, or owner-scoping contracts.
- No manual itinerary editor or second plan-authoring surface outside the primary conversation and proposal review.
- No visual clone of ChatGPT. The goal is familiar conversational simplicity while retaining XuyenViet's Vietnamese road-trip context and safety cues.
- No required long onboarding form for a new Trip Project.

## Implementation Notes

The initial implementation should reuse the existing shell and established boundaries:

- `apps/web/src/features/ai/ai-ask-composer.tsx` owns the primary chat shell, answer rendering, feedback behavior, composer context, and sidebar mounting.
- `apps/web/src/features/ai/trip-workspace-panel.tsx` remains presentational and read-only, but its hierarchy changes to focus, relevant plan slice, and trip information.
- `apps/web/src/features/ai/trip-proposal-review-card.tsx` receives a concrete proposal title and renders alternatives only when actionable.
- Chat/Trips server modules remain the owners of project selection, primary conversations, structured plan reads, proposal lifecycle, and authorization.
- The server must provide a typed, persisted source/provenance projection for every source disclosure. The client must not infer provenance, project matches, or plan mutations by parsing rendered prose.

Two new server-owned decision outputs are needed before UI wiring:

1. **Trip-context recommendation** for an ordinary conversation: no suggestion, one high-confidence owned project, multiple candidate owned projects, or a clarifying question. It must be deterministic enough to explain why a project is offered and must never reveal another owner's project.
2. **Trip-creation recommendation** for the current conversation: not appropriate, ask one clarification, or offer a confirmed/extracted draft. The decision is advisory; the actual project creation remains an explicit server command.

The proposal does not prescribe a particular LLM prompt or matching algorithm. It requires that any user-visible recommendation have a safe server-side decision contract, use only owner-scoped context, and tolerate uncertain matches by asking rather than guessing.

## Acceptance Scenarios

### Natural start

Given a signed-in traveler with no selected project, when they enter `Nhà mình đi ô tô từ Hà Nội vào Huế 5 ngày, có bé 5 tuổi`, then the UI sends one ordinary natural-language message without asking them to preselect chat versus project.

### Suggested creation

Given the assistant has enough durable context for a Hanoi-to-Hue family trip, when it finishes useful initial guidance, then it offers `Lưu chuyến đi này` and `Chưa cần`; selecting the latter leaves the conversation unscoped and does not repeatedly prompt without meaningful new context.

### Existing-project match

Given the traveler asks an unscoped question that strongly matches only an owned project, when the assistant responds, then it offers to continue in that named project or answer privately; it does not attach the project until the traveler chooses it.

### Ambiguous project match

Given more than one owned project matches an unscoped question, when a project recommendation is shown, then the traveler can choose an individual project or `Hỏi riêng lần này`; no project is chosen by default.

### Simple answer surface

Given an ordinary assistant answer with no high-risk fact, when it renders, then the default reading path contains the answer, optional follow-up prompts, light feedback controls, and the composer, but not a full warning panel, provenance panel, general-reasoning label, or feedback form.

### Specific verification disclosure

Given an answer recommends a place with time-sensitive opening hours, when it renders, then it includes a concise nearby verification note and a disclosure that opens the persisted source details; it does not claim the information is confirmed merely because it is displayed.

### Scoped composer

Given a traveler has selected `Hè miền Trung`, when the primary conversation renders, then the composer shows that it is planning for that trip and offers an accessible way to ask outside it or change trips.

### Decision-oriented workspace

Given a selected project has a pending proposal affecting Day 2, when the workspace opens, then the first visible workspace content explains the one decision, the relevant plan slice, and the appropriate review action before secondary constraints and history.

### Proposal alternatives

Given a pending proposal has no actionable alternatives, when it renders, then it does not show a disabled `Xem phương án khác` button.

## Rollout And Measurement

Ship behind the existing authenticated traveler experience without changing persistence or safety semantics. Begin with the answer-surface simplification and conversational project recommendations, then revise sidebar and workspace hierarchy after the recommendations are available.

Evaluate with privacy-safe aggregate signals:

- Percentage of meaningful planning conversations that become user-confirmed trips.
- Acceptance, decline, and later re-offer rates for trip-creation suggestions.
- Acceptance, private-answer, and ambiguity rates for existing-project recommendations.
- Time and number of turns from first planning request to a usable next action.
- Proposal review completion rate and explicit apply/dismiss outcomes.
- Negative feedback rate and reasons before versus after the answer-surface revision.
- Source-detail opening rate for freshness-sensitive recommendations, without treating low open rate as proof that verification is unnecessary.

Do not use these metrics to auto-create trips, auto-attach context, weaken owner confirmation, or hide required safety guidance.

## Dependencies And Follow-Up

This is a product and UX direction proposal. Before implementation, update the active PRD and UX spine, document the server-side recommendation contracts in architecture, then create scoped stories for:

1. Simplified assistant answer, feedback, and progressive source disclosure.
2. Chat-driven trip-creation recommendation and explicit project creation.
3. Existing-trip recommendation, confirmation, and scoped-composer switching.
4. Sidebar terminology and hierarchy revision.
5. Decision-oriented Trip Workspace and proposal-card revision.

The approved planning artifacts remain authoritative over this proposal where they conflict. Once the PRD, architecture, and UX spine adopt this direction, this proposal should be retained only as historical decision context or superseded with links to the authoritative documents.
