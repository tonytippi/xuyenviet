---
name: XuyenViet YouTube Discovery Control Tower
description: Desktop-first operator control tower for URL-only YouTube discovery and reviewed Knowledge intake handoff.
status: final
project: xuyenviet
created: 2026-08-06
updated: 2026-08-14
sources:
  - ../ux-xuyenviet-2026-07-05/DESIGN.md
  - ../../architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md
  - ../../../docs/proposals/ai-first-youtube-discovery.md
colors:
  primary: '#14532D'
  primary-foreground: '#FFFFFF'
  accent: '#D97706'
  warning: '#B91C1C'
  page: '#FFFFFF'
  map-paper: '#F8F5EE'
  road-ink: '#1F2937'
  shell-sidebar: '#F7F7F3'
  shell-sidebar-active: '#E8F3EC'
  shell-border: '#E5E7EB'
  discovery-pending: '#B45309'
  discovery-deferred: '#4B5563'
  discovery-healthy: '#047857'
typography:
  display-sm:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.05'
    letterSpacing: -0.05em
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.65'
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.3'
  caption:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.45'
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  page-desktop: 40px
  admin-sidebar-width: 264px
  inspector-width: 420px
components:
  action-queue-item:
    background: '#FFFFFF'
    foreground: '{colors.road-ink}'
    radius: '{rounded.md}'
    border: '1px solid {colors.shell-border}'
  candidate-active-row:
    background: '{colors.shell-sidebar-active}'
    foreground: '{colors.primary}'
    radius: '{rounded.md}'
  discovery-inspector:
    background: '#FBFAF7'
    foreground: '{colors.road-ink}'
    border-left: '1px solid {colors.shell-border}'
  signal-chip:
    background: '{colors.map-paper}'
    foreground: '{colors.road-ink}'
    radius: '{rounded.full}'
    border: '1px solid {colors.shell-border}'
  status-pending:
    background: '#FEF3C7'
    foreground: '{colors.discovery-pending}'
    radius: '{rounded.full}'
  status-deferred:
    background: '#F3F4F6'
    foreground: '{colors.discovery-deferred}'
    radius: '{rounded.full}'
  status-healthy:
    background: '#DCFCE7'
    foreground: '{colors.discovery-healthy}'
    radius: '{rounded.full}'
---

# XuyenViet YouTube Discovery Control Tower - Design Spine

## Brand & Style

This operator surface inherits the quiet, practical XuyenViet admin language from `../ux-xuyenviet-2026-07-05/DESIGN.md`. It is a workbench, not an analytics dashboard: the default screen points Mai to the few items that require a decision, while Mission and Health provide context on request.

The control tower distinguishes action-required work from ordinary history through placement, plain-language labels, and status text, never color alone. Its primary review pool serves Vietnamese operators selecting content for a primarily Vietnamese traveler audience; bounded foreign fallback is visibly separate. It does not render raw comments, model text, provider payloads, video material, transcripts, evidence spans, or capture internals.

## Colors

- `{colors.primary}` remains the sole primary action color, including `Accept` after the candidate explanation is visible.
- `{colors.accent}` marks useful guidance, priority context, and editable query attention; it is not an error color.
- `{colors.discovery-pending}` and `{components.status-pending}` mark review work, paired with text such as `Cần xem`.
- `{colors.discovery-deferred}` and `{components.status-deferred}` mark postponed work, paired with `Để sau`.
- `{colors.discovery-healthy}` and `{components.status-healthy}` describe successful Discovery health only, never knowledge verification or capture completion.
- `{colors.warning}` is reserved for persistent failure, rate limit, destructive actions, and failed acceptance. It does not indicate an unverified video.

## Typography

Inherit `{typography.display-sm}`, `{typography.body}`, `{typography.label}`, and `{typography.caption}`. Candidate titles remain one or two readable lines; dense metadata uses caption size with explicit labels. Vietnamese operational copy favors direct verbs and avoids raw state codes as the primary label.

## Layout & Spacing

- Desktop/tablet is the primary working surface. Use a flat admin navigation rail at `{spacing.admin-sidebar-width}`, a flexible main queue/list column, and a selected-candidate inspector at `{spacing.inspector-width}`.
- The action queue is a short, ordered worklist rather than a KPI card grid. It contains candidates requiring review, stalled high-priority Mission needs, and persistent Discovery failures only.
- Candidate review keeps the queue and inspector visible together. The queue prioritizes scanning; the inspector holds safe metadata, explanation, and one-at-a-time actions.
- Mission and Health use wide readable tables/lists with an optional focused detail pane. They may show concise new-policy distributions for language fit, duration fit, exclusion reason, and foreign fallback; avoid dense chart walls and continuously scrolling event feeds.
- Below the three-column workspace breakpoint, collapse navigation, then replace the inspector with a sequential detail page/sheet. At 320 CSS pixels and 400% zoom, every authorized function remains reachable without two-dimensional scrolling; desktop-first changes density, not availability.

## Elevation & Depth

- Navigation and the candidate inspector are flat structural regions separated by borders.
- `{components.action-queue-item}` and candidate rows use borders and tonal selection before shadows.
- Use a dialog only for destructive actions. Accept is immediate and never opens a confirmation dialog.
- Toasts are non-blocking confirmation or recovery feedback; they do not replace persistent inline state in the selected inspector.

## Shapes

- Use `{rounded.md}` for queue items, candidate rows, buttons, inputs, and focused metadata groups.
- Use `{rounded.lg}` only for major Mission/Health sections where grouping supports comprehension.
- Use `{rounded.full}` only for compact status and signal chips.

## Components

- **Action queue item** uses `{components.action-queue-item}`. It contains a clear type label, one-line reason, priority/date context, and one entry action. It does not expose raw error or model details.
- **Candidate queue row** shows thumbnail, title, channel, duration, human-readable view count, exact/relative publish time, Vietnamese language-fit label, plain-language recommendation, priority, and current operator state. Selected row uses `{components.candidate-active-row}`.
- **Candidate inspector** uses `{components.discovery-inspector}`. It shows canonical URL, safe video/channel metadata, originating query, duration, view count, publish time, language fit, safe eligibility reason, recommendation, up to five applicable factors and penalties, derived comment signals, prior safe capture outcome, and actions `Accept`, `Để sau`, `Bỏ qua`.
- **Foreign fallback section** is labelled `Nguồn ngoại ngữ bổ sung` and remains visually and semantically separate from the Vietnamese-first primary queue. It uses the same metadata evidence but never looks like a higher-ranked primary recommendation.
- **Language-fit chip** renders `vi` as `Nội dung tiếng Việt` and `likely_vi` as `Có khả năng là tiếng Việt`. Raw classifier codes or diagnostic inputs are not primary operator copy.
- **Accept feedback** temporarily disables inspector actions. A submitted intake reports `Đã thêm URL vào nguồn chờ xử lý. Bạn vẫn cần chạy YouTube Capture thủ công.` A duplicate reports `URL này đã có trong nguồn chờ xử lý hoặc đã được lưu trước đó.` It then advances selection. Neither outcome claims capture or knowledge creation.
- **Signal chip** uses `{components.signal-chip}` for safe derived signals such as `Có nhắc đến thay đổi gần đây`; it must not quote a comment or imply verified evidence.
- **Global Discovery switch** shows `Đang bật` / `Đang tắt` adjacent to the immediate toggle. Its feedback states the boundary: it controls planning/search/enrichment/triage only, not queued Knowledge sources or manual capture.
- **Query proposal row** distinguishes `Hệ thống đề xuất` and `Operator tạo` with text, not color alone. It shows query text, reason, priority, enabled/paused state, and next run.
- **Health incident row** uses concise provider/stage wording and safe time context. It distinguishes `Đang thử lại`, `Đã lỗi`, and `Bị giới hạn`, with next-attempt context when available; it never exposes provider payloads or secrets.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Open on a prioritized list of work that needs an operator | Open on a generic KPI dashboard or noisy event stream |
| Keep candidate queue and inspector visible together on desktop | Force a separate detail route for every candidate decision |
| State that Accept adds a URL to Knowledge intake and capture remains manual | Label Accept as capture, approval of knowledge, or successful Gemini analysis |
| Use concise factors and explicit penalties to explain triage | Present model scores as proof of accuracy or credibility |
| Show channel, duration, views, and publish time as review context | Treat popularity or freshness as proof that a video is correct |
| Keep foreign fallback in `Nguồn ngoại ngữ bổ sung` | Mix foreign-language fallback into Vietnamese-first primary ranking |
| Keep Health focused on action-required failures and trends | Show raw provider errors, comments, prompts, or payloads |
| Make global enablement immediate and legible | Hide the switch effect behind technical status codes or a modal ritual |
| Preserve the existing admin visual language | Introduce a separate analytics-product aesthetic or traveler chat shell |
