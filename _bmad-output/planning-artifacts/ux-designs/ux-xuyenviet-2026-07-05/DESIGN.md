---
name: XuyenViet
description: Responsive web UX for an AI-first Vietnam road-trip planning companion. shadcn/ui on Next.js + Tailwind assumed; this DESIGN.md owns the brand-layer visual contract.
status: draft
project: xuyenviet
created: 2026-07-05
updated: 2026-07-07
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
---

# XuyenViet — Design Spine

## Brand & Style

XuyenViet should feel like a practical road companion for Vietnam: calm enough for planning a family trip, precise enough to earn trust, and local enough that it does not look like a generic global travel chatbot. The visual posture is **map-paper utility with warm Vietnamese road-trip cues**: soft paper surfaces, strong readable text, restrained green route color, amber for active guidance, and explicit trust signals for sources.

[ASSUMPTION] The web app inherits shadcn/ui defaults on Next.js + Tailwind. This DESIGN.md specifies the brand-layer delta: color meaning, display typography, answer/source component treatments, and road-trip surface rules. shadcn defaults remain the base for dialogs, sheets, tabs, buttons, forms, dropdowns, toast, skeleton, card, badge, separator, and focus rings unless overridden here.

The product differentiator is not visual spectacle. It is trustworthy AI guidance with visible provenance. The UI should make uncertainty legible without making every answer feel like a compliance report.

## Colors

- **Route Green (`{colors.primary}`)** is the primary action and brand color. It represents forward motion, planned route, and safe go-ahead. Use for primary buttons, active navigation, selected trip project, and verified route actions.
- **Guide Amber (`{colors.accent}`)** marks AI guidance that needs attention: suggested next question, active itinerary option, and recommended follow-up. Do not use amber for warnings.
- **Route Teal (`{colors.route}`)** is for route segments, travel legs, and map-adjacent metadata when no actual map is present.
- **Map Paper (`{colors.map-paper}`)** gives planning cards a warmer surface than pure white. Use for trip plans, day-by-day summaries, and knowledge cards.
- **Road Ink (`{colors.road-ink}`)** is the main readable text color when custom cards sit on map paper.
- **Source colors** map to confidence labels: curated, community, unverified, partner, official. These labels appear as chips or compact metadata, never as decorative color blocks.
- **Freshness Amber (`{colors.freshness}`)** marks facts that may change: prices, opening hours, roads, weather, availability, promotions, and schedules.
- **Warning Red (`{colors.warning}`)** is reserved for safety, access denial, destructive delete confirmation, and unsupported/failure states.

Avoid: saturated travel gradients, generic sky-blue tourism palettes, decorative map pins everywhere, and using green to imply a fact is guaranteed.

## Typography

`Inter` owns the functional UI and long Vietnamese text. It is chosen for readable diacritics, dense chat answers, and form-heavy admin flows.

`Fraunces` owns sparse display moments only: public entry headline, empty-state headline, and major trip-project title. It gives XuyenViet a warmer editorial identity without compromising the app-tool feel.

Vietnamese copy must be tested with diacritics at all text sizes. Avoid all-caps Vietnamese labels except very short metadata, because all-caps reduces diacritic readability.

## Layout & Spacing

Use a responsive web shell.

- Mobile: single-column, `{spacing.page-mobile}` side padding, bottom-safe composer, source details as drawers/sheets.
- Tablet: single-column primary content with optional right-side context panel when width allows.
- Desktop: left navigation, central chat/planning column, optional right insight panel for trip context/sources/admin review metadata.

Chat answers use `{spacing.answer-gap}` between major sections. A single answer should read as a stack of scannable blocks: plan/options, rationale, practical tips, warnings, sources, uncertainty, and next steps. Do not present every section as equal weight; warnings and next steps should be easier to find than raw source metadata.

Maximum reading width for chat answer content: 760px. Admin review tables may use wider layouts, but editing and approval should happen in focused panels or detail views rather than spreadsheet-like walls.

## Elevation & Depth

Depth is functional, not decorative.

- Base surfaces inherit shadcn.
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
