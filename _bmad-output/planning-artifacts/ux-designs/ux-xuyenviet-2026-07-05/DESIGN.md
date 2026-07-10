---
name: XuyenViet
description: Responsive web UX for an AI-first Vietnam road-trip planning companion. shadcn/ui on Next.js + Tailwind assumed; this DESIGN.md owns the brand-layer visual contract.
status: draft
project: xuyenviet
created: 2026-07-05
updated: 2026-07-10
sources:
  - ../../prds/prd-xuyenviet-2026-07-04/prd.md
  - ../../architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - ../../epics.md
  - ../../implementation-readiness-report-2026-07-05.md
  - ../../sprint-change-proposal-2026-07-05-ai-usage-referral.md
  - ../../sprint-change-proposal-2026-07-07-ai-gateway-models-streaming-multimodal.md
colors:
  primary: '#14532D'
  primary-foreground: '#FFFFFF'
  accent: '#D97706'
  accent-foreground: '#1C1205'
  route: '#0F766E'
  route-foreground: '#FFFFFF'
  source-curated: '#166534'
  source-community: '#854D0E'
  source-unverified: '#6B7280'
  source-partner: '#1D4ED8'
  source-official: '#047857'
  freshness: '#B45309'
  warning: '#B91C1C'
  map-paper: '#F8F5EE'
  road-ink: '#1F2937'
  shell-sidebar: '#F6F4EF'
  shell-sidebar-active: '#E8F3EC'
  shell-border: '#E5E0D6'
  detail-panel: '#FBFAF7'
  detail-panel-card: '#FFFFFF'
typography:
  display:
    fontFamily: 'Fraunces'
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-sm:
    fontFamily: 'Fraunces'
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  body:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.65'
  label:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.3'
  caption:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.45'
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  '8': 64px
  page-mobile: 16px
  page-tablet: 24px
  page-desktop: 40px
  answer-gap: 20px
  sidebar-width: 288px
  sidebar-rail: 56px
  chat-width: 760px
  detail-width: 380px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  route-card:
    background: '{colors.map-paper}'
    foreground: '{colors.road-ink}'
    radius: '{rounded.lg}'
    border: '1px solid shadcn-border'
  source-chip-curated:
    background: '{colors.source-curated}'
    foreground: '#FFFFFF'
    radius: '{rounded.full}'
  source-chip-community:
    background: '{colors.source-community}'
    foreground: '#FFFFFF'
    radius: '{rounded.full}'
  source-chip-unverified:
    background: '{colors.source-unverified}'
    foreground: '#FFFFFF'
    radius: '{rounded.full}'
  source-chip-official:
    background: '{colors.source-official}'
    foreground: '#FFFFFF'
    radius: '{rounded.full}'
  source-chip-partner:
    background: '{colors.source-partner}'
    foreground: '#FFFFFF'
    radius: '{rounded.full}'
  freshness-warning:
    background: '#FEF3C7'
    foreground: '{colors.freshness}'
    radius: '{rounded.md}'
  app-shell-sidebar:
    background: '{colors.shell-sidebar}'
    foreground: '{colors.road-ink}'
    border: '1px solid {colors.shell-border}'
  app-shell-active-row:
    background: '{colors.shell-sidebar-active}'
    foreground: '{colors.primary}'
    radius: '{rounded.md}'
  chat-composer:
    background: '#FFFFFF'
    foreground: '{colors.road-ink}'
    radius: '{rounded.lg}'
    border: '1px solid shadcn-border'
  detail-panel:
    background: '{colors.detail-panel}'
    foreground: '{colors.road-ink}'
    border: '1px solid {colors.shell-border}'
  detail-card:
    background: '{colors.detail-panel-card}'
    foreground: '{colors.road-ink}'
    radius: '{rounded.lg}'
    border: '1px solid {colors.shell-border}'
---

# XuyenViet — Design Spine

## Brand & Style

XuyenViet should feel like a practical road companion for Vietnam: calm enough for planning a family trip, precise enough to earn trust, and familiar enough that users instantly understand the chat workspace. The final visual posture is **Vietnamese ChatGPT/Gemini-style planning plus contextual travel detail**: a simple public entry, a centered logged-in empty chat, and an active three-panel workspace with left history/projects, middle answer, and right detail panel for selected places, hotels, route impacts, and sources.

[ASSUMPTION] The web app inherits shadcn/ui defaults on Next.js + Tailwind. This DESIGN.md specifies the brand-layer delta: color meaning, display typography, answer/source component treatments, and road-trip surface rules. shadcn defaults remain the base for dialogs, sheets, tabs, buttons, forms, dropdowns, toast, skeleton, card, badge, separator, and focus rings unless overridden here.

The product differentiator is not visual spectacle. It is trustworthy AI guidance with visible provenance and a familiar conversation model. The UI should stay quiet until the user asks; after an answer exists, it can reveal richer contextual detail without making every answer feel like a compliance report.

## Colors

- **Route Green (`{colors.primary}`)** is the primary action and brand color. It represents forward motion, planned route, and safe go-ahead. Use for primary buttons, active navigation, selected trip project, and verified route actions.
- **Guide Amber (`{colors.accent}`)** marks AI guidance that needs attention: suggested next question, active itinerary option, and recommended follow-up. Do not use amber for warnings.
- **Route Teal (`{colors.route}`)** is for route segments, travel legs, and map-adjacent metadata when no actual map is present.
- **Map Paper (`{colors.map-paper}`)** gives planning cards a warmer surface than pure white. Use for trip plans, day-by-day summaries, and knowledge cards.
- **Road Ink (`{colors.road-ink}`)** is the main readable text color when custom cards sit on map paper.
- **Source colors** map to confidence labels: curated, community, unverified, partner, official. These labels appear as chips or compact metadata, never as decorative color blocks.
- **Freshness Amber (`{colors.freshness}`)** marks facts that may change: prices, opening hours, roads, weather, availability, promotions, and schedules.
- **Warning Red (`{colors.warning}`)** is reserved for safety, access denial, destructive delete confirmation, and unsupported/failure states.
- **Shell Sidebar (`{colors.shell-sidebar}`)** is the left app shell surface for conversation history and trip projects. It should feel quiet and tool-like, not like a marketing panel.
- **Shell Active Row (`{colors.shell-sidebar-active}`)** marks the active conversation or trip project without overusing saturated green.
- **Shell Border (`{colors.shell-border}`)** separates navigation from chat and supports nested grouping without heavy shadows.
- **Detail Panel (`{colors.detail-panel}`)** is the right contextual surface after an answer has selectable entities. It should feel like a focused inspector, not a second chat or map.
- **Detail Card (`{colors.detail-panel-card}`)** holds quick facts, related details, actions, and source chips for the selected entity.

Avoid: saturated travel gradients, generic sky-blue tourism palettes, decorative map pins everywhere, and using green to imply a fact is guaranteed.

## Typography

`Inter` owns the functional UI and long Vietnamese text. It is chosen for readable diacritics, dense chat answers, and form-heavy admin flows.

`Fraunces` owns sparse display moments only: public entry headline, empty-state headline, and major trip-project title. It gives XuyenViet a warmer editorial identity without compromising the app-tool feel.

Vietnamese copy must be tested with diacritics at all text sizes. Avoid all-caps Vietnamese labels except very short metadata, because all-caps reduces diacritic readability.

## Layout & Spacing

Use a responsive AI planning shell.

- Logged-out desktop: centered public hero with sign-in CTA and sign-in-gated ask box; no app shell sidebar.
- Logged-in empty desktop: left sidebar visible, center column contains large greeting and centered composer; no right detail panel before the first answer.
- Active desktop: persistent left sidebar using `{spacing.sidebar-width}`, central answer column capped at `{spacing.chat-width}`, right contextual detail panel using `{spacing.detail-width}`.
- Tablet: sidebar may collapse to `{spacing.sidebar-rail}`; right detail panel can stack below or open as sheet depending on available width.
- Mobile: no persistent sidebar; use top/menu sheet for history/projects, single-column chat, bottom-safe composer, and selected detail as a drawer/sheet.

Chat answers use `{spacing.answer-gap}` between major sections. A single answer should read as a stack of scannable blocks: plan/options, rationale, practical tips, warnings, sources, uncertainty, and next steps. Do not present every section as equal weight; warnings and next steps should be easier to find than raw source metadata.

Maximum reading width for chat answer content: 760px. Admin review tables may use wider layouts, but editing and approval should happen in focused panels or detail views rather than spreadsheet-like walls.

The left sidebar should borrow the learnability of ChatGPT/Gemini without becoming a clone: top action, grouped lists, compact row menus, active row state, and a quiet hierarchy between conversations and trip projects. The right detail panel appears only when it has a selected entity to explain; empty chat should not show a blank inspector.

## Elevation & Depth

Depth is functional, not decorative.

- Base surfaces inherit shadcn.
- The app shell sidebar is flat and persistent; use border and active row color before shadows.
- Trip plan cards and knowledge review cards use tonal separation on `{colors.map-paper}` with a subtle border.
- Sheets and dialogs inherit shadcn elevation.
- Avoid stacked shadows inside chat answers; use headings, spacing, and borders instead.

## Shapes

Shape language is soft but not playful.

- `{rounded.sm}` for inputs and small controls.
- `{rounded.md}` for buttons, chips, compact source rows, and warning callouts.
- `{rounded.lg}` for trip plan cards, answer section cards, knowledge review cards, and admin shells.
- `{rounded.xl}` only for hero/empty-state containers.
- `{rounded.full}` only for compact metadata chips.

## Components

- **Primary button** uses `{components.button-primary}`. Label with action verbs: `Đăng nhập bằng Google`, `Hỏi AI`, `Lưu bản nháp`, `Phê duyệt`.
- **App shell sidebar** uses `{components.app-shell-sidebar}`. It contains the `Cuộc trò chuyện mới` action, grouped conversation history, trip projects, account/privacy entry, and admin entry only for authorized users.
- **Sidebar active row** uses `{components.app-shell-active-row}`. Exactly one primary workspace row is active: the selected conversation, selected trip project, or new-chat empty state. Row actions are compact and must not appear only on hover.
- **Trip project row** behaves like a project/workspace item, with title, optional route/date hint, and active context indicator when the main chat is scoped to that trip.
- **Conversation row** uses one-line title plus optional short preview/date. It should feel like chat history, not a document library.
- **Chat composer** uses `{components.chat-composer}` and remains visually anchored to the main chat column. It can support text plus accepted image attachments without widening the reading column.
- **Logged-out ask box** visually resembles the chat composer but is sign-in-gated. It may accept visible draft text later, but submitting requires Google sign-in before AI calls or persistence.
- **Logged-in empty start** uses a centered greeting, centered composer, and starter cards. It must not render the right detail panel before an answer exists.
- **Right detail panel** uses `{components.detail-panel}` and appears in active conversations when the user selects, hovers/focuses, or the assistant highlights a place, hotel, route segment, source, cost, warning, or trip fact. It is an inspector, not a map-first surface.
- **Detail card** uses `{components.detail-card}` for selected item title, summary, quick facts, related route/hotel/driving notes, action chips, and source/provenance chips.
- **Route card** uses `{components.route-card}` for day plans, route segments, hotel-area suggestions, and practical stop lists. Route cards should support a short title, distance/time if known, confidence/source summary, and a clear next step.
- **Answer source chips** use confidence label colors. They summarize source category in the answer body: `Curated`, `Community`, `Official`, `Unverified`, `Partner`. Detailed URLs appear in expandable source detail rows.
- **Image attachment row** uses shadcn input/card primitives with compact thumbnail, filename or generic image label, size/status text, and a clear remove action. It must not look like an approved source chip.
- **Streaming answer state** uses subtle pending treatment and normal answer typography; avoid flashy typewriter effects that reduce readability or conflict with reduced-motion settings.
- **Freshness warning** uses `{components.freshness-warning}`. It must be compact and specific: `Giá/giờ mở cửa có thể thay đổi. Kiểm tra lại trước khi đi.`
- **Storage notice** is a low-friction inline callout near first AI Ask use. It should not look like an error. Use muted shadcn surface with one link to privacy/details.
- **Delete confirmation** uses shadcn destructive dialog styling. The destructive action must name the object: `Xóa cuộc trò chuyện`, `Xóa dự án chuyến đi`.
- **Admin knowledge card** uses map-paper card treatment plus structured metadata rows: title, type, route/location, source, collected date, confidence, freshness-sensitive flag, status.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Make source/confidence visible but progressively disclosed | Put long URLs and provenance blocks inline after every paragraph |
| Use green for primary route/action semantics | Use green to imply unverified facts are safe or guaranteed |
| Keep Vietnamese text readable with generous line height | Compress chat answers into dense dashboards |
| Use amber for guidance and freshness attention | Use amber as generic decoration |
| Preserve shadcn behavior and accessibility defaults | Build a custom component system before MVP |
| Separate traveler and admin surfaces visually and navigationally | Hide operator workflows inside traveler chat |
| Make deletion/destructive flows sober and explicit | Use playful confirmation copy for privacy-sensitive actions |
| Make conversation history and trip projects visible in the left app shell | Force users to manage planning context only inside dropdowns |
| Use familiar ChatGPT/Gemini navigation patterns selectively | Copy another product's visual identity or remove XuyenViet's travel trust cues |
| Keep logged-in empty state centered and calm | Show an empty right detail panel before the user has asked anything |
| Use the right panel to explain selected answer entities | Make the right panel a map-first surface or a second chat thread |
