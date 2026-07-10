---
title: Frontend Shell Implementation Notes
status: draft
created: 2026-07-10
source_spine: ./ARCHITECTURE-SPINE.md
source_ux: ../../ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
---

# Frontend Shell Implementation Notes

## Purpose

Guide frontend implementation for the accepted XuyenViet redesign without expanding the architecture spine into per-component detail.

## Canonical States

| State | Route/Surface | Required layout |
|---|---|---|
| Logged out | `/` | Public homepage, sign-in CTA, sign-in-gated ask box, no authenticated sidebar payload |
| Logged in empty | `/ai-ask` with no active content | Left sidebar, centered Vietnamese greeting, centered composer, starter cards, no right detail panel |
| Active chat | `/ai-ask` with selected conversation/trip context | Left sidebar, center answer/conversation, right contextual detail panel when an entity is selected |

## Ownership Rules

- `src/app/page.tsx` owns the public logged-out entry surface.
- `src/app/ai-ask/page.tsx` owns the authenticated planning shell route.
- `src/features/chat-trips/*` owns conversation history, trip projects, active conversation/project read models, and user-owned mutations.
- `src/features/retrieval/*` and `src/features/knowledge/*` own source-backed detail data.
- `src/features/retrieval/provenance.ts` and AI orchestration-owned provenance rows remain the source for source/confidence rendering.
- UI components must not mutate another feature's aggregate directly.

## Detail Panel Contract

The right panel is a read model derived from the selected answer entity. It is not persisted as a separate product object.

Minimum selected entity descriptor:

```ts
type AnswerEntityDescriptor = {
  type: "place" | "hotel_area" | "route_segment" | "source" | "warning" | "cost" | "trip_fact" | "action";
  label: string;
  section?: string;
  sourceCategory?: "chat_trip_context" | "knowledge" | "web" | "general";
  owner?: {
    table: string;
    id: string;
  };
  detail?: Record<string, string>;
  provenanceIds?: string[];
};
```

Implementation may keep panel selection as transient client state for the first redesign story. Make it URL-addressable only if a story explicitly requires shareability or browser-back semantics.

## Rendering Rules

- Logged-in empty state must not show the right detail panel.
- Active chat may show the right detail panel when an answer entity is selected.
- If no entity is selected, either hide/collapse the right panel or keep the latest useful selected entity, according to the story scope.
- Source/confidence UI must render from stored provenance or safe source snapshots, never from parsed answer prose.
- Detail panel content must not expose raw source material, operator-only notes, provider payloads, or admin controls.
- User-facing copy is Vietnamese-first.

## Responsive Rules

- Desktop: three columns for active chat: sidebar, answer, detail panel.
- Desktop empty state: two columns: sidebar and centered composer.
- Tablet: sidebar may collapse to icon rail; detail panel may remain right-side or move below/sheet.
- Mobile: sidebar and selected detail are sheets/drawers; chat remains the primary column.

## Story Split Suggestion

1. Public logged-out homepage redesign.
2. Authenticated empty AI Ask shell redesign.
3. Active AI Ask three-panel shell with existing persisted messages.
4. Selectable answer entity descriptors and right detail panel read model.
5. Mobile sheet/drawer behavior for sidebar and selected detail.
