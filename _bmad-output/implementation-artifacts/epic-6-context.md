# Epic 6 Context: Family-Aware Planning And Public MVP Quality Loop

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 6 makes XuyenViet's answers adapt when children are part of a trip and closes the public MVP quality loop. It ensures family trips receive realistic pacing, activity suitability, child-relevant tips, and balanced recommendations, while feedback and evaluation data measure whether the assistant is useful, grounded, Vietnamese-first, and meaningfully better than generic ChatGPT.

## Stories

- Story 6.1: Detect Children And Family Travel Needs
- Story 6.2: Family-Aware Driving And Stop Recommendations
- Story 6.3: Family-Aware Activities And Suitability Notes
- Story 6.4: Capture Answer Usefulness Feedback
- Story 6.5: Run Public MVP Answer Evaluation Prompt Set
- Story 6.6: Public MVP Quality Dashboard

## Requirements & Constraints

Family-aware behavior applies only when children, child ages, family members, or family constraints are present in chat or trip context. If details are unclear and matter to the recommendation, the assistant should ask concise follow-up questions while still giving useful general family guidance. If no family context exists, answers must not force irrelevant child-focused advice.

When children are part of the trip, answers must account for shorter driving blocks, rest stops, bathroom or food breaks, child-friendly activities, learning opportunities, hotel convenience, backup activities, and family-relevant warnings. Long, tiring, or risky route segments should trigger pacing guidance instead of unrealistic all-day driving advice. Parent goals and child comfort should be balanced through alternatives, shorter visits, rest time, or backup options.

The assistant must identify activities that may be unsuitable, boring, difficult, or tiring for children when relevant. Child discounts, family tips, prices, promotions, schedules, service availability, and similar changing facts should be included only with source/confidence handling and verification warnings.

Stored family context must stay limited to travel-relevant facts such as child age range, comfort needs, and preferences. The product must not require or intentionally store children's full names, identity documents, payment data, medical details, exact home address, or other sensitive personal data.

Public MVP quality measurement must capture a simple usefulness rating for assistant answers. Feedback should be linked to the assistant response and may include optional short text, but it must never block reading, continuing chat, opening sources, or using the detail panel. Duplicate or changed ratings must be handled consistently so reporting is not corrupted.

The public MVP evaluation loop uses five required prompt types: magic-moment family trip, sparse-data question, freshness-sensitive question, service/activity question, and route logistics question. Evaluation scoring uses a 1-10 rubric covering user-context use, practical specificity, source grounding, uncertainty handling, family-awareness when relevant, and Vietnamese clarity. Counter-metrics must track unsupported claims, missing uncertainty labels for freshness-sensitive facts, and answers rated no better than generic ChatGPT.

Success signals relevant to this epic include the magic-moment answer containing at least one child-aware planning recommendation, one practical route/logistics tip, one uncertainty or freshness warning, and one suggested next step; at least 7 of 10 sampled users or testers rating the magic-moment answer useful at 7/10 or higher; and no more than 2 of 10 test users saying the answer feels no better than generic ChatGPT.

## Technical Decisions

Family context is part of the Chat/Trips context model. AI extraction may propose chat-session or trip-project context updates, but the Chat/Trips module validates allowed travel-planning fields before persistence and rejects clearly disallowed sensitive data. Allowed context includes traveler count, child age range, preferences, prior trips, avoided or repeated places, budget range, hotel style, driving tolerance, food/activity preferences, itinerary constraints, and current trip details.

Family-aware answer generation must work through the existing AI orchestration and source-bundle pipeline. Answers are grounded by selected trip project context, current chat-session context, approved knowledge, web search fallback, and general reasoning in that priority order. Streaming must not begin until context, retrieval/search inputs, and provenance ledger inputs are assembled.

Source and confidence rendering must use persisted provenance, not answer text parsing. Each assistant answer stores row-per-source-item provenance with source category, references to chat/trip/knowledge/web sources where applicable, ranking or retrieval metadata, source type, verification status, prompt usage, citation usage, and a source snapshot. Assistant message and provenance persist in the same transaction.

Family-relevant approved knowledge can come from existing card types such as kid-friendly tip, discount/promotion, activity, hotel area, service, warning, parking, food, route note, or cost note. Traveler retrieval remains fail-closed: only current approved, traveler-safe, properly linked knowledge/source records can enter source bundles. Raw operator-only source material must never appear in traveler answers, feedback views, or quality dashboards.

Feedback/Eval owns public MVP quality measurement. It stores versioned prompt sets, rubric dimensions, evaluator prompt/model version, run outputs, linked assistant responses/provenance, usefulness scores, hallucinated unsupported-claim flags, missing-uncertainty flags, and generic-ChatGPT comparison flags. Quality reporting should connect feedback and eval results to answer provenance and retrieval decisions so low-quality answers can be traced to context, approved knowledge, web search, or general reasoning issues.

Feedback and evaluation data are product state in PostgreSQL and should be introduced through Drizzle migrations and typed server modules. Feedback is a protected server-side mutation and should preserve authenticated actor/context as appropriate. Admin/operator quality dashboard access must remain role-checked and visually separate from traveler chat.

## UX & Interaction Patterns

Traveler-facing copy remains Vietnamese-first, practical, and calm. Assistant answers use scannable sections for plan/options, rationale, practical tips, warnings, sources, uncertainty, and next steps, with only relevant sections shown. Follow-up questions should be limited to a few concise questions and should not demand a form before helping.

Family-related details can appear as answer content, selectable warnings, costs, trip facts, route segments, places, hotel areas, or source chips. Selecting an entity opens the contextual detail panel on desktop or a sheet/drawer on mobile. Detail quick facts may include family fit, best time, verify status, confidence/source type, or route impact, and provenance chips must not expose raw operator-only material.

Usefulness rating appears in the assistant answer footer as a lightweight optional action. Optional comment entry appears only after rating. Rating must not block chat, source inspection, detail-panel use, or continued planning.

The quality dashboard is an admin/operator surface, not part of traveler chat. It should support filtering by prompt type or time range and should show usefulness ratings, evaluation scores, counter-metric flags, and missing-signal states without claiming readiness when data is insufficient.

## Cross-Story Dependencies

Story 6.1 depends on chat/trip context extraction and use from Epic 3. Stories 6.2 and 6.3 depend on Story 6.1 family-need detection and on Epic 5 source-bundle, retrieval, provenance, freshness, and uncertainty behavior when sourced family details are used.

Story 6.4 depends on persisted assistant responses and provenance from Epic 5 so feedback can link to the answer being rated. Stories 6.5 and 6.6 depend on feedback/evaluation storage plus retrieval decisions and provenance from Epic 5 to trace quality outcomes. Story 6.6 depends on Story 6.4 feedback and Story 6.5 evaluation runs having data to report.
