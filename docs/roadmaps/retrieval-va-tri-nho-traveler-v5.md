# Lộ trình cải tiến Retrieval & Trí nhớ Traveler - Phiên bản 5

## Trạng thái

Đề xuất ngày 2026-08-10, thay thế v4 (`docs/roadmaps/retrieval-va-tri-nho-traveler-v4.md`). Đây là lộ trình định hướng, không phải build plan đã được phê duyệt. Mỗi nhóm thay đổi lớn cần PRD và architecture slice riêng trước khi triển khai.

Lý do thay thế: v4 đúng khi ưu tiên evaluation, loại bỏ quota type cứng, và giữ server kiểm soát retrieval. Tuy nhiên, v4 chưa đặt một điều kiện nền tảng lên trước FTS, embeddings, hoặc tăng prompt budget: một atomic knowledge card chỉ được dùng làm evidence khi fact của nó thực sự thuộc phạm vi hành trình và facet mà traveler đang hỏi.

Ví dụ bắt buộc phải bị chặn:

```text
Query: "Lập lịch trình Hà Nội - Đà Nẵng"
Card:  "Đường Đà Nẵng đến Quy Nhơn dài khoảng 320 km"

Kết quả: exclude. Card thuộc chặng đi tiếp sau điểm đến, dù cùng nhắc Đà Nẵng
hoặc searchable metadata có các từ như "lịch trình" hay "Hà Nội".
```

## Baseline và vấn đề đã quan sát

- `knowledge_cards` là các fact atomic: một nhận xét ngắn, có type, location hoặc route segment, conditions, evidence và policy.
- Corpus active hiện có phần lớn card có `locationName` hoặc `routeSegment`, nên có dữ liệu tối thiểu để làm scope-aware retrieval.
- Retrieval lexical hiện tại tách câu hỏi thành token đơn và cộng điểm match. Ví dụ `"lịch trình Hà Nội - Đà Nẵng"` có thể trở thành `lịch`, `trình`, `hà`, `nội`, `đà`, `nẵng`.
- Những token generic như `lịch`, `trình` và các mảnh entity như `hà`, `nội` không xác lập geographic applicability.
- Search document hiện có thể chứa source/provenance metadata. Metadata này hữu ích cho audit nhưng không mô tả semantic ownership của fact, nên không được ảnh hưởng lexical relevance.
- Nếu tăng số card hoặc prompt budget trước khi sửa scope correctness, off-route leakage sẽ tăng thay vì chất lượng tăng.

## Quyết định kiến trúc

### Giữ nguyên

- `knowledge_cards` là kho knowledge duy nhất, evidence-grounded, source-linked.
- `chat_context` và trip-project context là kho traveler memory duy nhất.
- Geographic projections, FTS documents, embeddings, topic briefs và evaluation datasets là derived state; không phải source of truth.
- Server sở hữu policy eligibility, retrieval execution, final evidence selection và provenance persistence.
- Raw source, transcript, provider payload và operator-only data không vào traveler-facing prompt.
- Không dùng Mem0, Zep, LangMem, GraphRAG hoặc full autonomous tool calling khi chưa có evidence cụ thể rằng kiến trúc này thiếu năng lực.

### Quyết định mới trong v5

1. **Text similarity chỉ tìm candidate; không cấp quyền dùng evidence.** Một card chỉ vào final evidence set sau policy eligibility, geographic applicability, facet applicability và final packing.

2. **Query có route rõ phải được hiểu như structured travel query.** Origin, destination, direction, task, constraints và requested facets là output server-validated; không xử lý như bag of words.

3. **Route applicability là hard rule khi đủ certainty.** Card nằm ngoài route, trước origin, hoặc sau destination bị exclude cho route-planning query. Khi geographic parsing không chắc, fallback là soft ranking hoặc hỏi làm rõ, không hard-filter mù quáng.

4. **Location và route là canonical retrieval entities.** Multi-word entities như `Hà Nội`, `Đà Nẵng`, `Cam Lộ - La Sơn` là units; không score các mảnh token của entity như `hà` hoặc `nẵng`.

5. **Source metadata không là lexical evidence của card.** Source label, URL, publisher, capture metadata và provenance chỉ dùng cho policy, audit, freshness và display; không được tạo keyword match cho fact.

6. **AI có vai trò bounded semantic judge, không là retrieval owner.** Sau candidate retrieval và hard scope validation, AI có thể đánh giá card-to-query relevance theo schema. Server không cho AI override policy hay geographic exclusion.

7. **Final evidence đáp ứng coverage plan, không top-K hoặc type quota.** Required facets đến từ query plan; diversity là tie-breaker. Không chọn card chỉ để đủ loại, cũng không để một card irrelevant lấp chỗ trống.

8. **Atomic facts và itinerary synthesis là hai lớp khác nhau.** Card không cần là itinerary hoàn chỉnh. Answer model tổng hợp itinerary từ selected facts, nêu rõ information gaps và không biến card ngoài scope thành detail của plan.

## Target RAG Harness

```text
Câu hỏi traveler
  -> load relevant traveler memory / selected trip context
  -> AI-assisted, schema-validated travel query plan
  -> canonical geographic and route resolution
  -> candidate retrieval song song
       metadata/geo + lexical phrase + vector + facet candidates
  -> server policy eligibility re-check
  -> deterministic geographic applicability classification
  -> exclude hard off-route / wrong-direction candidates
  -> bounded AI card relevance adjudication for remaining candidates
  -> facet-aware evidence planning + diversity-aware ordering
  -> deterministic contextual compression + budget-aware packing
  -> web fallback cho missing/freshness-sensitive facet
  -> answer synthesis + persisted provenance
```

`Geographic and route resolution` là route graph có cấu trúc, phục vụ product domain. Nó không phải GraphRAG: server resolve path bằng canonical IDs và deterministic graph traversal, không cho LLM tự traversal hoặc suy ra edge từ raw text.

## Contracts mục tiêu

### Travel Query Plan

```ts
type TravelQueryPlan = {
  task: "itinerary" | "route_advice" | "place_advice" | "accommodation" | "food" | "warning" | "comparison";
  route?: {
    originId: string;
    destinationId: string;
    direction: "forward" | "reverse" | "unspecified";
    requestedRouteStyle?: "fastest" | "coastal" | "scenic" | "unspecified";
  };
  requestedFacets: Array<"route" | "driving_segments" | "stops" | "accommodation" | "food" | "activities" | "warnings" | "fuel_or_charging" | "cost">;
  constraints: Record<string, unknown>;
  freshnessRequired: boolean;
  ambiguities: string[];
};
```

- Server validates canonical IDs, enum values, maximum facets and allowed constraints.
- Ambiguous query may produce a safe broad plan plus a concise clarification question; it must not invent route endpoints.
- Rule-based extraction is preferred for known aliases and canonical locations. AI planning is used when deterministic extraction is insufficient.

### Card Geographic Projection

```ts
type CardGeographicScope = {
  scope: "place" | "route_segment" | "corridor" | "nationwide" | "unknown";
  locationIds: string[];
  routeEdgeIds: string[];
  route?: {
    startLocationId: string;
    endLocationId: string;
    directed: boolean;
  };
  corridorIds: string[];
  extractionConfidence: "high" | "medium" | "low";
};
```

- Đây là projection derived từ card-owned `locationName`, `routeSegment`, type và reviewed canonical geographic registry. Nó không đổi hoặc thay thế các field source-of-truth trên card.
- `routeEdgeIds` chỉ được set khi card có route scope match chính xác một hay nhiều canonical edges. Card có `routeSegment` free-text nhưng không resolve chắc chắn giữ `routeEdgeIds = []` và `extractionConfidence = low`.
- Projection được rebuild qua lifecycle/indexing path khi card đổi content, geography, lifecycle hoặc eligibility. Mỗi projection phải mang card `contentVersion` và geographic registry version đã dùng để resolve; stale projection không được dùng cho hard route decision.
- Unknown/low-confidence scope không được giả vờ là exact route match.
- Registry ban đầu chỉ cần support corridor và route segments thực sự có trong product scope; không xây GIS, distance/radius engine hoặc universal geographic graph.

### Canonical Route Graph và Path Resolution

```ts
type RouteLocation = {
  id: string;
  canonicalName: string;
  aliases: string[];
  kind: "city" | "district" | "landmark" | "junction" | "region";
};

type RouteCorridor = {
  id: string;
  label: string;
  supported: boolean;
};

type RoutePath = {
  id: string;
  corridorId: string;
  label: string;
  style: "fastest" | "coastal" | "scenic" | "standard";
  supported: boolean;
};

type RouteEdge = {
  id: string;
  pathId: string;
  corridorId: string;
  fromLocationId: string;
  toLocationId: string;
  ordinal: number;
  travelDirection: "forward" | "reverse" | "both";
};

type ResolvedRoutePath = {
  pathId: string;
  corridorId: string;
  direction: "forward" | "reverse";
  locationIds: string[];
  edgeIds: string[];
  registryVersion: number;
};
```

- `RouteLocation`, `RouteCorridor`, `RoutePath` và `RouteEdge` là versioned reference data owned by the Retrieval module. Knowledge owns card fields and derived card projections; Chat/Trips and Source modules only resolve canonical IDs through exported Retrieval functions.
- A path is one supported itinerary alternative within a corridor; it may represent the standard, fastest, coastal or scenic route. An edge is an ordered travel segment. `ordinal` is unique within one `(pathId, travelDirection)`. A bidirectional physical road is represented by usable forward/reverse traversal semantics, not by treating order as irrelevant.
- Known aliases resolve deterministically to one `RouteLocation`. Ambiguous aliases return an unresolved result; they do not select a nearest or popular location.
- Given canonical origin and destination, server resolves only supported path(s) that contain both endpoints in the requested direction. An explicit route style or an owner-confirmed trip path selects one matching path; otherwise every matching path remains an alternative. The output must include the exact path, edge and location sequence used by retrieval.
- If exactly one path resolves, it is eligible for hard geographic decisions. If multiple materially different paths resolve and query style/trip context does not choose one, server retains the alternatives as soft candidate scopes and asks a concise route-style clarification; it must not hard-exclude cards unique to one plausible path. It may still hard-exclude a card that is off-route for every resolved alternative.
- If no path resolves, route-specific hard exclusion is disabled. Retrieval may use exact location matches and generic advice, records `route_path_unresolved`, and never claims a card is on-route.
- A card route edge is `on_route` only if its edge is on the resolved path in usable travel direction. A card whose first applicable edge begins after the destination's path ordinal is `off_route_after_destination`; one ending before origin is `off_route_before_origin`.
- A destination-local/place card is not inferred on-route merely because it shares a corridor. Its use is decided by location membership plus facet applicability.

### Geographic Applicability

```ts
type GeographicRelation =
  | "exact_route"
  | "on_route"
  | "origin_local"
  | "destination_local"
  | "planned_stop_local"
  | "nationwide_applicable"
  | "near_route"
  | "off_route_before_origin"
  | "off_route_after_destination"
  | "off_route"
  | "unknown";
```

| Relation | Itinerary có origin-destination rõ |
|---|---|
| `exact_route`, `on_route` | Allow và ưu tiên cao |
| `origin_local`, `destination_local`, `planned_stop_local` | Allow khi requested facet phù hợp |
| `nationwide_applicable` | Allow với ưu tiên thấp hơn |
| `near_route` | Allow khi route style hoặc stop plan phù hợp |
| `off_route_before_origin`, `off_route_after_destination`, `off_route` | Exclude |
| `unknown` | Không làm route evidence; chỉ có thể là generic advice khi intent match mạnh |

Card `Đà Nẵng - Quy Nhơn` cho query `Hà Nội - Đà Nẵng` phải có relation `off_route_after_destination` và bị exclude trước AI relevance adjudication.

`near_route` không dựa trên distance/radius suy đoán. Trong MVP, nó chỉ được phát khi registry có explicit approved relation từ location/edge của card tới một location hoặc planned stop trên resolved path. Không có explicit relation thì dùng `off_route` hoặc `unknown`, không dùng `near_route` như escape hatch.

### Deterministic Selection Boundary

Trước AI adjudication, server gắn mỗi candidate một immutable retrieval snapshot:

```ts
type RetrievalCandidateSnapshot = {
  cardId: string;
  contentVersion: number;
  policy: "contextual_use" | "caveat_only";
  queryPlanVersion: string;
  routePath?: ResolvedRoutePath;
  geographicRelation: GeographicRelation;
  eligibleFacets: string[];
  lexicalSignals: string[];
  exclusionReason?: "policy_ineligible" | "off_route_before_origin" | "off_route_after_destination" | "off_route" | "facet_inapplicable" | "route_path_unresolved";
};
```

- Policy-ineligible and hard off-route candidates never reach AI adjudication or prompt packing.
- `caveat_only` cards may be adjudicated only for warning/verification facets and never become factual itinerary premises.
- `eligibleFacets` is derived deterministically from card type, geographic relation, query task and current policy. AI may select a facet only from this list.
- The final selector re-checks card content version, eligibility, projection version and policy immediately before render. Any stale candidate is omitted and its omission reason is persisted.

### Card Relevance Adjudication

```ts
type CardRelevanceDecision = {
  cardId: string;
  applicable: boolean;
  relevance: "essential" | "useful" | "optional" | "irrelevant";
  facet: "route" | "stops" | "accommodation" | "food" | "activity" | "warning" | "charging" | "cost" | "general";
  reasonCode: "direct_route_evidence" | "on_route_logistics" | "destination_planning" | "constraint_match" | "generic_practical_advice" | "wrong_route" | "outside_trip_scope" | "facet_mismatch" | "insufficient_context";
  requiresCaveat: boolean;
};
```

- AI chỉ nhận safe card projection, query plan, geographic relation, current policy và bounded candidate IDs.
- Server reject output không thuộc candidate IDs, `eligibleFacets`, policy hoặc geographic hard rules. AI cannot turn an excluded card into applicable, downgrade a required caveat, or create a new route/facet.
- AI không chọn raw source, không gọi search tool và không persist state.
- Batching phải preserve exactly one result per input candidate and schema validation. Missing, duplicate or invalid results fail that batch closed; deterministic field-aware ranking may still select the remaining scope-eligible candidates, but never accepts an unreviewed excluded card.
- AI output is an ephemeral ranking decision. The persisted audit/provenance record contains the query-plan version, candidate snapshot, adjudication model/prompt version, validated decision and final render outcome, not raw model reasoning.

## Roadmap

### Bước 0: Retrieval Scope Correctness Baseline

Đây là prerequisite của mọi cải tiến retrieval khác.

- Audit searchable document fields và loại source labels, URLs, publisher, capture metadata, evidence quote, provider metadata khỏi lexical matching.
- Tách `candidateCount`, `policyEligibleCount`, `scopeEligibleCount`, `adjudicatedApplicableCount`, `renderedCount`, và các reason codes omitted/excluded trong retrieval telemetry.
- Thêm test cases có `mustExcludeCardIds`, không chỉ `expected relevant cards`.
- Baseline metrics: off-route leakage rate, route-scope precision, source-metadata leakage rate, facet miss rate, provenance correctness.

**Acceptance:** Query `lịch trình Hà Nội - Đà Nẵng` không chọn hay render card `Đà Nẵng - Quy Nhơn` chỉ vì source label, token generic, endpoint chung hoặc freshness ordering.

### Bước 1: Canonical Geography và Route Applicability

- Tạo registry nhỏ, versioned cho canonical locations, aliases, corridors và ordered route segments trong product corridor.
- Tạo route graph `RouteLocation` -> `RouteEdge` -> `RoutePath` -> `RouteCorridor`, deterministic path resolver và explicit supported-path policy.
- Tạo/rebuild `CardGeographicScope` derived projection cùng indexing lifecycle.
- Implement deterministic route/location resolution cho query plan và `GeographicRelation` classifier.
- Hard-exclude off-route chỉ khi query entities và one supported path resolve với confidence cao; log unknown/low-confidence/multi-path cases để mở rộng registry hoặc cải thiện parser.

**Acceptance:** `Cam Lộ - La Sơn` và `Lăng Cô - Hải Vân - Đà Nẵng` được nhận là on-route cho Hà Nội - Đà Nẵng; `Đà Nẵng - Quy Nhơn` là off-route-after-destination.

### Bước 2: Query Understanding + Field-Aware Lexical Retrieval

- Parse multi-word canonical entities, route direction, task, constraints, requested facets và freshness intent.
- Replace bag-of-words score bằng phrase/entity-aware scoring theo card-owned fields: title, type, `locationName`, `routeSegment`, summary, tags và safe practical details.
- Generic planning expressions như `lịch trình`, `tư vấn`, `gợi ý`, `nên đi` chỉ tạo task/facet signal, không chứng minh geographic relevance.
- Candidate retrieval vẫn broad để bảo toàn recall; final selection không dùng lexical score một mình.

**Acceptance:** `Hà Nội`, `Đà Nẵng`, `Cam Lộ - La Sơn` được xử lý là entity/phrase. Các token `hà`, `nội`, `lịch`, `trình` không independently elevate an off-route card.

### Bước 3: Evaluation Harness cho Scope và Facet

- Tạo versioned, deterministic Vietnamese travel evaluation set với route, location, family, EV, freshness và broad planning cases.
- Mỗi case định nghĩa expected route, required facets, must-include, may-include và must-exclude cards.
- Run Postgres-dependent retrieval evaluation theo integration test boundaries hiện hữu; fixture không thay thế integration validation của index/config/query behavior.
- Metrics: route-scope precision, off-route leakage rate, Recall@candidate, required-facet coverage, final-set precision, policy/provenance correctness, p50/p95/p99 per stage.

**Gate:** Không triển khai FTS/vector production retrieval trước khi baseline chứng minh scope classifier và tests bắt được off-route leakage.

### Bước 4: FTS Phrase Retrieval

- Spike deployable Postgres options: `unaccent` + `simple`; chỉ xem xét extension khác khi vận hành/migration an toàn.
- Index và query chỉ card-owned searchable projection.
- Evaluate FTS against current field-aware lexical baseline, đặc biệt exact entity, diacritics, aliases và paraphrases.

**Gate:** FTS phải không làm tăng off-route leakage và phải cải thiện measurable candidate recall hoặc phrase/entity matching.

### Bước 5: Lifecycle-safe Embeddings

- Add embeddings chỉ cho policy-eligible card projection; embedding input không có raw/operator-only/source-label leakage.
- Reindex/remove on content, geographic projection, lifecycle, policy hoặc eligibility changes.
- Benchmark Vietnamese travel models trên same evaluation set; choose by recall, scope precision, deployability, cost, latency và data-policy fit.
- Store derived vectors in PostgreSQL/pgvector; provider/vector store không là source of truth.

### Bước 6: Hybrid Candidate Retrieval + RRF

- Merge metadata/geo, FTS phrase và vector candidates bằng RRF hoặc equivalent evaluated fusion.
- Hybrid chỉ tạo broad candidates. Policy and geographic applicability still run after fusion.
- Compare lexical-only, vector-only và hybrid on candidate recall, route-scope precision và facet coverage.

**Gate:** Tiếp tục chỉ khi hybrid cải thiện recall/coverage mà không tăng off-route leakage sau hard scope validation.

### Bước 7: Bounded AI Card Relevance Adjudication

- AI adjudicates policy-eligible, geographic-scope-eligible candidates against the structured query plan.
- Server validates schema, candidate membership, policy and geography invariants.
- Use deterministic fallback if adjudication fails or is unavailable.
- Measure precision uplift, facet coverage uplift, false exclusion rate, cost and latency.

### Bước 8: Facet-aware Evidence Planning + Contextual Compression

- Convert query plan into required, useful và optional evidence facets.
- Select essential/useful cards by applicability and facet contribution; diversity only resolves comparable candidates, never overrides relevance.
- A required facet without eligible evidence remains explicitly missing. It triggers safe uncertainty wording, a concise clarification where appropriate, or web fallback for freshness-sensitive information; it never causes an off-scope card to be selected.
- Deterministic compression keeps card identity, policy instruction, source/evidence identity, conditions and fact-relevant details.
- Pack whole card representations until budget; never truncate arbitrary card text or persist provenance for unrendered items.

### Bước 9: Prompt Budget và Attribution Scale

- Increase source bundle budget only after selected-card scope precision is validated.
- Treat source budget, history budget, rendered-source handle capacity, compact/minimal modes and provenance writer as one contract.
- Measure source budget separately from history budget to attribute answer-quality changes correctly.
- Final telemetry records actual rendered cards, cards omitted by budget and cards omitted by relevance/scope; no obsolete target-count semantics.

### Bước 10: Topic Briefs

- Build only when density/evaluation shows atomic cards are prompt-inefficient for a recurring route/topic.
- Brief is a derived, versioned projection over supporting card IDs and versions, not an independent fact authority.
- Brief becomes stale when any supporting card changes eligibility/content; provenance remains able to resolve supporting facts.

### Bước 11: Traveler Memory Evaluation và Improvement

- Retain current scopes: profile preferences, trip-project constraints and conversation context.
- Measure extraction accuracy, correction/supersession, question relevance, deletion compliance, follow-up continuity and privacy safety.
- Improve existing `chat_context`/trip context before considering external frameworks.

### Bước 12: Reconsider Only With Evidence

- Reranker: only if hybrid + AI adjudication remains weak on candidate precision.
- Bounded refinement: only if an evaluated query plan has a concrete missing facet after first-pass retrieval.
- Full tool calling: only if bounded server-controlled retrieval cannot solve demonstrated multi-entity tasks with provenance/policy intact.
- GraphRAG: only if a much larger corpus has frequent multi-hop questions that the geographic model, hybrid retrieval and topic briefs demonstrably cannot solve.
- External memory frameworks: only if current memory has persistent, measured extraction/correction/relevance/deletion failures.

## Evidence Selection Rules

- A card must be policy-eligible and currently active before it can be a candidate.
- A route-planning query with confident origin/destination excludes `off_route_before_origin`, `off_route_after_destination` and `off_route` cards.
- Destination-local cards are useful only for destination-relevant facets such as arrival, accommodation, food or activities; they are not route evidence by default.
- Generic national advice cannot replace missing route evidence and must be labeled/weighted as general advice.
- Freshness-sensitive facts require appropriate verification guidance; freshness does not turn an off-route card into relevant evidence.
- Search/source metadata cannot improve relevance score. It may be used only for policy, source diversity, freshness and audit.
- Provenance rows are written only for sources actually rendered into the final answer prompt.

## Deferred Decisions

### GraphRAG

Do not build GraphRAG. The canonical geographic registry is deterministic domain reference data, not semantic graph retrieval. Reconsider only with measured multi-hop failure beyond this roadmap.

### Autonomous Tool Calling

Do not allow the answer model to call retrieval tools freely. Query planning and card adjudication are structured AI stages; server executes all retrieval and preserves policy/provenance.

### Automatic Decay

Do not suppress knowledge by age or embedding similarity alone. Use freshness-sensitive policy, explicit verification and audited knowledge workflow.

### External Memory Frameworks

Do not add Mem0, Zep or LangMem before current traveler-memory measurements demonstrate a specific failure that the existing model cannot address.

## Thứ tự triển khai tóm tắt

```text
0.  Scope correctness baseline + source-metadata isolation
1.  Canonical geography + route applicability
2.  Query understanding + field-aware lexical retrieval
3.  Scope/facet retrieval evaluation harness
4.  Full-text phrase retrieval
5.  Lifecycle-safe embeddings
6.  Hybrid candidate retrieval + RRF
7.  Bounded AI card relevance adjudication
8.  Facet-aware evidence planning + deterministic compression
9.  Prompt budget and attribution scale
10. Topic briefs when density/evaluation supports them
11. Traveler-memory evaluation and improvement
12. Reconsider reranker, refinement, tool calling, GraphRAG, external memory only with evidence
```

## Tham chiếu

- Lộ trình v1: `docs/roadmaps/knowledge-retrieval-and-traveler-memory.md`
- Lộ trình v2: `docs/roadmaps/retrieval-va-tri-nho-traveler-v2.md`
- Lộ trình v3: `docs/roadmaps/retrieval-va-tri-nho-traveler-v3.md`
- Lộ trình v4 (superseded): `docs/roadmaps/retrieval-va-tri-nho-traveler-v4.md`
- YouTube Discovery Proposal: `docs/proposals/ai-first-youtube-discovery.md`
- Architecture Spine: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
