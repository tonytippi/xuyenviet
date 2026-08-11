# Lộ trình cải tiến Retrieval & Trí nhớ Traveler - Phiên bản 6

## Trạng thái

Đề xuất ngày 2026-08-10, thay thế v5 (`docs/roadmaps/retrieval-va-tri-nho-traveler-v5.md`).

Đây là roadmap kỹ thuật chi tiết và architecture slice định hướng cho retrieval/traveler memory.
Đây chưa phải build plan đã được phê duyệt. Mỗi tranche triển khai vẫn phải cập nhật
PRD/architecture hiện hành, tạo epics/stories, kiểm tra implementation readiness và
sprint planning theo workflow BMad của dự án.

V6 giữ các invariants đúng của v5 nhưng thay đổi phương pháp triển khai:

- Dùng **Scope-first Faceted Retrieval Cascade**: policy và geographic/facet allowlist được xác lập trước lexical/vector retrieval.
- Tách physical route segment khỏi path membership để một đoạn đường có thể thuộc nhiều route alternative mà không duplicate semantic identity.
- Không dùng `extractionConfidence` làm quyền hard-filter; dùng resolution status và provenance deterministic/reviewed.
- Đưa evaluation harness và negative fixtures lên Bước 0, trước mọi thay đổi lớn.
- Dùng weighted PostgreSQL FTS và exact canonical signals làm baseline production.
- Chọn evidence bằng marginal facet coverage dưới prompt budget, không bằng top-K hoặc type quota.
- Chỉ dùng AI cho semantic grey band; không adjudicate mọi candidate mặc định.
- Chỉ thêm embeddings, RRF hoặc reranker khi evaluation chứng minh một retrieval gap cụ thể.
- Phát hiện missing/freshness-sensitive facets và gọi web fallback trước final evidence packing.

## Mục tiêu

V6 phải làm cho retrieval trả lời được bốn câu hỏi theo đúng thứ tự:

1. Card này hiện có được phép dùng cho traveler không?
2. Fact của card có thuộc geographic scope và direction của chuyến đi không?
3. Card có đóng góp cho facet/constraint traveler đang hỏi không?
4. Trong các card hợp lệ, tập evidence nào tạo coverage tốt nhất trong prompt budget?

Text similarity chỉ hỗ trợ câu hỏi 3 và thứ tự ưu tiên trong câu hỏi 4. Nó không được cấp quyền trả lời câu hỏi 1 hoặc 2.

## Phạm vi

### Trong phạm vi

- Retrieval từ active, evidence-eligible `knowledge_cards`.
- Query understanding cho tiếng Việt, canonical place/route entities, multi-leg trip context và travel facets.
- Deterministic route/path applicability cho supported Hanoi-to-HCMC product scope.
- Field-aware lexical retrieval trong PostgreSQL.
- Optional semantic rescue bằng embeddings/hybrid retrieval khi có evaluation evidence.
- Facet coverage planning, contextual compression, prompt packing và provenance.
- Web fallback cho missing hoặc freshness-sensitive facets.
- Evaluation và telemetry cho retrieval scope, facet coverage, latency, cost và provenance.
- Evaluation traveler memory hiện hữu trong `chat_context` và structured Trip Project context.

### Ngoài phạm vi

- Dynamic routing, ETA, live traffic, weather, road closure hoặc Google Maps/Routes.
- GIS distance/radius engine và automatic near-route inference.
- Universal Vietnam road graph.
- External vector store làm source of truth.
- GraphRAG, autonomous retrieval tools hoặc answer-model-owned retrieval.
- Mem0, Zep, LangMem hoặc traveler-memory framework mới.
- Automatic knowledge decay dựa trên age/similarity.
- New microservice, queue, deployment workload hoặc environment variable chỉ để phục vụ roadmap này.

## Assumptions cần được xác nhận qua implementation artifacts

- [ASSUMPTION] Public MVP tiếp tục tập trung Hanoi-to-HCMC corridor và corpus ban đầu ở quy mô hàng trăm, chưa phải hàng triệu card.
- [ASSUMPTION] PostgreSQL production target cho phép extension `unaccent`; `pg_trgm` chỉ được dùng nếu migration/deployment spike xác nhận an toàn.
- [ASSUMPTION] Canonical route registry ban đầu được quản lý như versioned, code-reviewed reference data; chưa cần admin UI mới.
- [ASSUMPTION] Một future Trips-owned canonical route reference, sau khi traveler xác
  nhận và được persist cùng registry snapshot/aggregate fence, là authority cao hơn route
  style suy ra từ câu chat. Các free-text origin/destination/transport labels hiện tại
  không phải confirmed route authority.
- [ASSUMPTION] Prompt/source budget cụ thể được benchmark trên model đang active; roadmap chỉ cố định nguyên tắc whole-card packing, không cố định số card.

## Baseline hiện tại

### Product và kiến trúc

- `knowledge_cards` là atomic, evidence-grounded planning facts và là knowledge source of truth.
- `chat_context` và structured Trip Project context là traveler-memory source of truth.
- PostgreSQL sở hữu product state và retrieval state.
- Retrieval re-check current lifecycle, evidence/source eligibility và traveler policy.
- Answer generation chỉ bắt đầu sau khi context/source/provenance inputs được assemble.
- Raw source, transcript, provider payload, operator-only evidence và protected metadata không vào traveler-facing prompt.

### Retrieval implementation đã quan sát

- `knowledge_card_search_documents.searchable_text` hiện gộp title, type, location, route, summary, practical details, tags, confidence và source metadata.
- Source kind, label, publisher, collected date, source type, verification status, official/partner và support level có thể tạo lexical match dù không thuộc semantic fact.
- Query được lower-case, split theo whitespace và giữ tối đa 12 token.
- Scoring cộng điểm nếu searchable text chứa từng token; không có exact entity, phrase, field weight, direction hoặc geographic boundary.
- Candidate order có freshness/update-time tie-break, nên một card mới nhưng off-route có thể vượt card đúng scope.
- Source bundle hiện có target count cứng và giới hạn nhỏ, chưa chọn theo required facet coverage.

### Xung đột source of truth phải giải quyết trước implementation

- Architecture AD-17 và PRD hiện hành chỉ cho internal traveler retrieval khi
  `verification_requirement = none` và policy là `contextual_use`; `operator_required`,
  pending, conflicted hoặc failed-verification phải bị exclude.
- Code hiện tại vẫn có branch `caveat_only` cho `operator_required`. V6 không ratify
  divergence này: internal retrieval chỉ dùng `contextual_use`. Item cần operator
  verification trở thành evidence gap/web-verification trigger, không vào source bundle
  như knowledge-card premise.
- PRD hiện tại trigger web search khi broad planning query có ít hơn ba relevant active
  cards. V6 muốn thay count semantics bằng unsatisfied requirement keys. Bước 0 phải cập
  nhật/approve PRD contract này; trước khi approval hoàn tất, production giữ compatibility
  trigger `< 3` bên cạnh gap-based telemetry.

### Failure bắt buộc phải chặn

~~~text
Query: "Lập lịch trình Hà Nội - Đà Nẵng"
Card:  "Đường Đà Nẵng đến Quy Nhơn dài khoảng 320 km"

Kết quả bắt buộc:
- card không được coi là route evidence;
- card không được gửi tới semantic adjudication;
- card không được render vào prompt;
- provenance không được ghi như nguồn đã dùng;
- reason code là off_route_after_destination khi selected/authoritative path cho phép hard decision.
~~~

## Paradigm: Scope-first Faceted Retrieval Cascade

~~~text
Traveler question + selected Trip Project context
  -> deterministic context allowlist
  -> structured query parsing
  -> canonical entity and route resolution
  -> current policy/evidence eligibility
  -> deterministic geographic + facet allowlist
  -> field-aware lexical retrieval inside allowlist
  -> optional semantic rescue inside allowlist
  -> deterministic high/low decision
  -> bounded AI adjudication for grey-band candidates only
  -> facet-pool ranking
  -> marginal-coverage evidence selection
  -> missing/fresh facet analysis
  -> bounded web fallback per gap
  -> joint budget-aware whole-item packing
  -> final version/policy/projection re-check
  -> answer synthesis + exact render/provenance ledger
~~~

## Invariants

1. **Eligibility precedes relevance.** Non-active, stale, evidence-ineligible hoặc policy-ineligible cards không được vào semantic candidate set.

2. **Scope precedes similarity.** Exact/authoritative geographic exclusions chạy trước FTS, vector và AI adjudication.

3. **Unknown is not generic.** Unresolved place/route cards không được tự động hạ cấp thành nationwide/general advice.

4. **Canonical IDs carry geographic authority.** Free text và embedding không cấp route membership.

5. **One shared facet vocabulary.** Query planning, card projection, ranking, AI schema, telemetry và provenance dùng cùng `TravelFacet` enum.

6. **Caveats are deterministic.** Policy, verification và freshness rules quyết định caveat; AI không được tạo, bỏ hoặc downgrade caveat.

7. **AI handles ambiguity, not authority.** AI chỉ đánh giá semantic relevance trong candidate IDs, eligible facets và geographic boundary do server cấp.

8. **Coverage is marginal, not quota-based.** Card được chọn vì đóng góp evidence mới cho requested facet/constraint, không phải để đủ loại.

9. **Missing remains missing.** Không có evidence hợp lệ thì ghi gap, hỏi làm rõ hoặc web fallback; không lấp bằng off-scope card.

10. **Whole-item packing.** Không cắt arbitrary card text; card hoặc web evidence item chỉ được tính provenance khi thực sự render.

11. **Every hard decision is reproducible.** Query-plan version, registry version, content version, resolution method và reason code đủ để replay quyết định.

12. **Expensive stages are evidence-gated.** Vector, RRF, AI adjudication và topic brief chỉ được productionize sau ablation/evaluation gate.

13. **No hidden source of truth.** Search projections, vectors, route projections và topic briefs luôn dẫn về current PostgreSQL owner rows.

14. **Failure narrows evidence.** Failure ở projection, AI, web hoặc indexing không được mở rộng candidate eligibility.

## Module ownership

### Knowledge

- Owns canonical card content fields, lifecycle, evidence, policy inputs và content version.
- Owns dirty markers khi content/evidence/lifecycle thay đổi.
- Không tự quyết định query-specific route applicability.

### Retrieval

- Owns route registry, canonical aliases, path/segment memberships và registry version.
- Owns derived card geographic/facet/search projections.
- Owns query planning contract, candidate generation, applicability, ranking, evidence selection và retrieval telemetry.
- Exposes typed resolution/query functions cho Chat/Trips và Source ingestion; module khác không đọc route registry tables trực tiếp.

### Chat/Trips

- Owns user-selected Trip Project, anchors, legs, constraints và selected/confirmed path choice.
- Chỉ cung cấp typed context snapshot; không mutate retrieval reference data.

### AI Orchestration

- Owns stage orchestration, model calls, timeouts, usage events và final answer provenance.
- Không sửa policy, canonical scope hoặc selected trip state.

### Search

- Owns external web result capture và provider adapter.
- Web result không trở thành knowledge card nếu chưa qua Knowledge workflow.

### Feedback/Eval

- Owns evaluation datasets/runs/results và human usefulness feedback.
- Không trở thành runtime retrieval authority.

### Single-writer aggregate contract

| Aggregate/artifact | Single writer | Rule |
|---|---|---|
| Canonical card/evidence/lifecycle | Knowledge | Retrieval chỉ consume typed eligibility snapshot |
| `CardEligibilitySnapshot` | Knowledge | Immutable decision cho exact card/evidence-set/policy versions |
| Route registry release | Retrieval registry publisher | Draft, validate rồi atomic activate một immutable snapshot |
| Derived geo/facet/search/vector projection | Retrieval indexing worker | Fenced theo projection generation, không mutate card |
| `RetrievalRun` và `SelectionManifest` | Retrieval | Immutable query/candidate/selection decision |
| `WebCapture` | Search | Immutable captured provider result; không ghi prompt usage |
| `PromptRenderManifest` và `usedInPrompt` | AI Orchestration | Atomically pin exact rendered variants trước provider call |
| Assistant response provenance | AI Orchestration | Derived từ PromptRenderManifest; module khác không update độc lập |

~~~ts
type CardEligibilitySnapshotV6 = {
  id: string;
  cardId: string;
  contentVersion: number;
  evidenceSetRevision: number;
  policyRuleVersion: string;
  state: "contextual_use" | "exclude";
  allowedFacets: TravelFacet[];
  reasonCodes: string[];
  decidedAt: string;
};
~~~

- Knowledge aggregate evidence theo publication/policy contract hiện hành và phát một
  typed decision; Retrieval không tự chọn `any`/`all`/quorum bằng cách diễn giải lại raw
  evidence rows.
- `operator_required`, conflicted, pending hoặc otherwise ineligible luôn `exclude`.
- Eligibility được re-check ở final render bằng owner function, nhưng decision semantics
  vẫn do Knowledge định nghĩa.

### Query execution identity

~~~ts
type QueryExecutionContextV6 = {
  runId: string;
  retrievalReadMode: "legacy" | "v6_shadow" | "v6_active";
  normalizedQuestionHash: string;
  queryPlanHash: string;
  tripSnapshotId: string | null;
  tripSnapshotVersion: number | null;
  registrySnapshotId: string;
  facetVocabularyVersion: string;
  parserVersion: string;
  eligibilityRuleVersion: string;
  rankingConfigVersion: string;
  selectorConfigVersion: string;
  runtimePolicyVersion: string;
};

type ProjectionCompatibilitySetV6 = {
  contentVersion: number;
  evidenceSetRevision: number;
  registrySnapshotId: string;
  facetVocabularyVersion: string;
  geoProjectionSchemaVersion: string;
  facetProjectionSchemaVersion: string;
  searchProjectionSchemaVersion: string;
};

type RetrievalRuntimePolicyV6 = {
  version: string;
  maximumPolicyEligibleCandidates: number;
  maximumCandidatesPerRequirementKey: number;
  maximumGreyBandCandidates: number;
  maximumAiBatchSize: number;
  maximumWebQueries: number;
  maximumWebResultsPerRequirementKey: number;
  maximumRenderedItems: number;
  stageTimeoutMs: Record<string, number>;
  diagnosticTraceRetentionHours: number;
};
~~~

- Mọi hard decision pin exact immutable snapshot/config identity, không chỉ tên schema
  `travel_query_plan_v6`.
- Mặc định derived projections phải exact-match compatibility set của retrieval run.
- Backward compatibility khác exact match chỉ được phép qua explicit, reviewed migration
  map; không suy ra vì version string trông gần nhau.
- Persist bounded sanitized query plan payload hoặc content-addressed hash kèm immutable
  owner snapshot reference đủ để replay.
- User-derived execution state phải có retention/deletion propagation theo chat/Trip
  ownership contract; deletion không để lại payload có thể tái dựng user question/context.
- Candidate caps, batch sizes, timeouts, web bounds và diagnostic retention luôn đến từ
  pinned runtime policy; không hard-code khác nhau trong independently-built stages.

## Shared contracts

### TravelFacet

~~~ts
type TravelFacet =
  | "route"
  | "driving_segment"
  | "stop"
  | "accommodation"
  | "food"
  | "activity"
  | "warning"
  | "fuel_or_charging"
  | "parking"
  | "cost"
  | "general";

type RequestedFacet = {
  facet: TravelFacet;
  importance: "required" | "useful" | "optional";
  reason:
    | "explicit_query"
    | "task_default"
    | "trip_constraint"
    | "freshness_policy";
};
~~~

`TravelFacet` phải nằm trong shared contracts package. Không module nào tạo facet synonym riêng như `activities`/`activity` hoặc `charging`/`fuel_or_charging`.

### TypedTravelConstraints

~~~ts
type TypedTravelConstraints = {
  adultCount?: number;
  childCount?: number;
  children?: Array<{
    ageRange: string | null;
    comfortTags: string[];
    preferenceTags: string[];
  }>;
  vehicleType?: "car" | "motorcycle" | "ev";
  evChargingNeed?: "none" | "preferred" | "required";
  drivingToleranceHours?: number;
  budgetCurrency?: "VND";
  budgetMinVnd?: number;
  budgetMaxVnd?: number;
  preferenceTags?: string[];
  avoidItems?: Array<{
    category: "place" | "activity";
    label: string;
  }>;
};
~~~

- Contract reuse losslessly các field hiện có của `TravelerWorkspaceProjection.constraints`
  và `trip_project_constraints`. Retrieval không tạo parallel vehicle/budget/child vocabulary.
- Dates, route style và transient query preferences nằm trong query plan/Trip snapshot,
  không được ghi ngược vào Trip constraints chỉ vì retrieval parse được chúng.
- Nếu schema Trips thay đổi, adapter phải versioned, lossless và có per-field tests.
- Server chỉ nhận allowlisted keys và bounded scalar/string-array/object values.
- Unknown keys bị reject hoặc bỏ với telemetry; không truyền nguyên `Record<string, unknown>` vào model/search.
- Sensitive data ngoài traveler-memory contract hiện hữu không được thêm vào constraint.

### TravelQueryPlan v6

~~~ts
type TravelIntent =
  | "itinerary"
  | "route_advice"
  | "place_advice"
  | "comparison"
  | "verification";

type QueryLeg = {
  originId: string;
  destinationId: string;
  direction: "forward" | "reverse";
  selectedPathId?: string;
  plausiblePathIds: string[];
  hardScopeAuthority:
    | "traveler_selected_path"
    | "confirmed_trip_path"
    | "registry_complete_od"
    | "none";
};

type TravelQueryPlanV6 = {
  version: "travel_query_plan_v6";
  intents: TravelIntent[];
  legs: QueryLeg[];
  requestedFacets: RequestedFacet[];
  constraints: TypedTravelConstraints;
  freshnessRequiredFacets: TravelFacet[];
  parsingMethod:
    | "deterministic"
    | "deterministic_with_trip_context"
    | "ai_assisted_validated";
  unresolvedEntities: string[];
  ambiguities: Array<{
    code:
      | "origin_ambiguous"
      | "destination_ambiguous"
      | "path_ambiguous"
      | "route_direction_ambiguous"
      | "constraint_ambiguous";
    safeQuestion?: string;
  }>;
};
~~~

Rules:

- Query plan có thể chứa nhiều legs và nhiều intents.
- `direction` được định nghĩa theo canonical path orientation trong pinned registry
  snapshot: `forward` đi từ path canonical origin đến canonical destination; `reverse`
  đi theo sequence đảo hợp lệ.
- Longest canonical alias match chạy trước token-level parsing.
- Structured Trip Project anchors/legs/constraints được ưu tiên hơn inference từ chat.
- AI planner chỉ chạy khi deterministic parser còn ambiguity có ảnh hưởng retrieval.
- Server validates every ID, enum, array bound và relationship.
- AI không được invent location/path ID.
- Nếu route chưa resolve đủ authority, `hardScopeAuthority = "none"`; không hard-exclude bằng một path tình cờ là path duy nhất registry biết.

## Canonical route registry

### Physical RouteSegment

~~~ts
type RouteLocation = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  aliases: string[];
  kind: "city" | "district" | "landmark" | "junction" | "region";
  active: boolean;
};

type RouteSegment = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  label: string;
  allowedDirections: Array<"from_to" | "to_from">;
  active: boolean;
};
~~~

`RouteSegment` biểu diễn semantic/physical segment identity. Nó không chứa `pathId` hoặc `ordinal`.

### RoutePath và memberships

~~~ts
type RouteCorridor = {
  id: string;
  label: string;
  active: boolean;
};

type RoutePath = {
  id: string;
  corridorId: string;
  label: string;
  style: "fastest" | "coastal" | "scenic" | "standard";
  canonicalOriginId: string;
  canonicalDestinationId: string;
  active: boolean;
};

type RoutePathLocationMembership = {
  id: string;
  pathId: string;
  locationId: string;
  ordinal: number;
};

type RoutePathSegmentMembership = {
  id: string;
  pathId: string;
  segmentId: string;
  ordinal: number;
  traversal: "from_to" | "to_from";
};
~~~

Registry validation phải đảm bảo:

- Location ordinal unique trong một path.
- Segment ordinal unique trong một path.
- Segment ordinal nối location ordinal `n` với `n + 1` theo đúng traversal.
- Traversal phải thuộc `RouteSegment.allowedDirections`.
- Một physical segment có thể xuất hiện trong nhiều paths mà giữ cùng segment ID.
- Reverse query có thể reverse một bidirectional path sequence; nếu direction không hợp lệ, registry phải có path khác hoặc return unresolved.
- MVP registry cấm duplicate `(pathId, locationId)` và `(pathId, segmentId)` trong
  cùng path. Loop/repeated membership chỉ được thêm trong architecture slice sau với
  occurrence-aware endpoint contract; không dùng `min/max` trên repeated IDs.

### OD coverage authority

~~~ts
type RouteOdCoverageAssertion = {
  originId: string;
  destinationId: string;
  direction: "forward" | "reverse";
  eligiblePathIds: string[];
  coverage:
    | "known_partial"
    | "supported_alternatives_complete";
  registrySnapshotId: string;
  status: "draft" | "active" | "retired";
  effectiveFrom: string;
  effectiveTo?: string;
};
~~~

- `known_partial` cho phép soft path ranking nhưng không cấp hard exclusion chỉ vì card không nằm trên known path.
- `supported_alternatives_complete` cho phép hard-exclude card off-route cho mọi eligible path trong product scope.
- Traveler-selected hoặc confirmed Trip Project path luôn cho phép hard decision trên exact selected path, kể cả OD registry chỉ `known_partial`.
- Coverage assertion là product-domain assertion, không tuyên bố mọi con đường ngoài đời đã được model.
- Validator phải chứng minh mỗi eligible path chứa contiguous origin/destination
  occurrences theo đúng direction trong cùng registry snapshot.
- Chỉ active assertion trong effective window và exact registry snapshot mới cấp
  `registry_complete_od` authority.

### Resolved route

~~~ts
type ResolvedQueryLeg = {
  legId: string;
  originId: string;
  destinationId: string;
  direction: "forward" | "reverse";
  pathIds: string[];
  selectedPathId?: string;
  segmentIdsByPath: Record<string, string[]>;
  locationIdsByPath: Record<string, string[]>;
  hardScopeAuthority: QueryLeg["hardScopeAuthority"];
  registrySnapshotId: string;
};
~~~

Current Trips schema chưa có canonical location/path refs. Một path chỉ có
`confirmed_trip_path` authority sau khi:

- Trips owns canonical origin/destination/path refs;
- traveler confirmation được persist qua owner command;
- refs pin registry snapshot;
- command dùng aggregate/item version fence;
- deleted/superseded Trip state invalidates later query snapshots.

Resolution tạm từ current free-text labels chỉ là deterministic query aid và không được
gắn `confirmed_trip_path`.

## Card scope projection

~~~ts
type ScopeResolutionStatus =
  | "exact"
  | "reviewed"
  | "ambiguous"
  | "unknown";

type ScopeResolutionMethod =
  | "canonical_id"
  | "exact_alias"
  | "deterministic_route_parse"
  | "operator_review"
  | "legacy_backfill";

type CardScopeClaimV6 =
  | {
      kind: "place";
      locationId: string;
    }
  | {
      kind: "path_interval";
      pathId: string;
      startLocationMembershipId: string;
      endLocationMembershipId: string;
      startEdgeOrdinalInclusive: number;
      endEdgeOrdinalExclusive: number;
      traversal: "forward" | "reverse";
    }
  | {
      kind: "corridor_general";
      corridorId: string;
      allowedFacets: TravelFacet[];
    }
  | {
      kind: "nationwide";
      allowedFacets: TravelFacet[];
    }
  | {
      kind: "unresolved";
      sourceField: "locationName" | "routeSegment";
    };

type CardGeographicProjectionV6 = {
  cardId: string;
  contentVersion: number;
  evidenceSetRevision: number;
  registrySnapshotId: string;
  projectionVersion: "card_geo_v6";
  projectionGeneration: string;
  scopeClaims: CardScopeClaimV6[];
  resolutionStatus: ScopeResolutionStatus;
  resolutionMethod: ScopeResolutionMethod;
  matchedInputs: Array<{
    field: "locationName" | "routeSegment" | "type";
    normalizedValueHash: string;
  }>;
  status: "active" | "stale" | "disabled";
};
~~~

Rules:

- Projection derive từ card-owned geography fields và versioned registry, không từ source label/evidence metadata.
- Chỉ `exact` hoặc `reviewed` projection được dùng cho hard geographic decision.
- `ambiguous`/`unknown` place hoặc route card chỉ có `unresolved` claim và không được dùng làm route evidence.
- `nationwide` phải là explicit deterministic/reviewed claim; không suy ra từ failure resolve geography.
- LLM có thể đề xuất mapping cho operator/reference-data workflow nhưng không được tự ghi `exact`/`reviewed`.
- Stale projection bị loại khỏi hard route evidence cho đến khi rebuild.
- Geography projection update không tự thay đổi canonical card content; projection vẫn là derived state.
- Một `path_interval` luôn pin một path và contiguous half-open edge interval. Projection
  validation reject disconnected segments, mixed paths hoặc interval rỗng.
- Physical segment thuộc nhiều paths tạo nhiều independent `path_interval` claims; không
  union segment IDs rồi suy ra một interval giả.
- `corridor_general` chỉ làm general/corridor-wide supporting evidence cho allowlisted
  facets. Nó không làm segment premise và không cấp local place applicability.
- Persistent representation dùng normalized claim/link rows với composite foreign keys
  tới registry snapshot/entities và indexes theo card/path/location/corridor. DTO có thể
  aggregate arrays/claims khi đọc; JSON/array không thay relational integrity.

## Facet projection

~~~ts
type CardFacetProjectionV6 = {
  cardId: string;
  contentVersion: number;
  facetVocabularyVersion: string;
  projectionGeneration: string;
  projectionVersion: "card_facet_v6";
  facets: Array<{
    facet: TravelFacet;
    applicability: "primary" | "supporting";
    derivation:
      | "card_type"
      | "allowlisted_practical_detail"
      | "reviewed_tag";
  }>;
  status: "active" | "stale" | "disabled";
};
~~~

- Card type to facet mapping là versioned deterministic map.
- Practical-detail keys chỉ tạo facet signal nếu key nằm trong allowlist.
- Free-form tag không tự tạo facet authority; tag phải map qua reviewed taxonomy.
- `operator_required`/`caveat_only` code state không eligible cho internal retrieval;
  nó tạo gap/web-verification signal theo authoritative PRD/architecture.

## Search projection

~~~ts
type KnowledgeSearchProjectionV6 = {
  cardId: string;
  contentVersion: number;
  evidenceSetRevision: number;
  registrySnapshotId: string;
  facetVocabularyVersion: string;
  geoProjectionGeneration: string;
  facetProjectionGeneration: string;
  searchProjectionVersion: "knowledge_search_v6";
  projectionGeneration: string;
  titleText: string;
  geographyText: string;
  facetText: string;
  bodyText: string;
  normalizedExactPhrases: string[];
  searchVector: unknown; // PostgreSQL tsvector in persistence
  textHash: string;
  status: "active" | "stale" | "disabled";
};
~~~

Searchable fields:

- `titleText`: title/fact.
- `geographyText`: canonical location/segment names và reviewed aliases resolved cho card.
- `facetText`: canonical card type/facet names và reviewed tags.
- `bodyText`: summary và allowlisted safe practical details.

Forbidden lexical fields:

- Source label, kind, publisher, URL hoặc canonical URL.
- Capture metadata hoặc provider metadata.
- Evidence quote.
- Verification status, official/partner flags hoặc support level.
- Raw source/transcript.
- Operator notes, judge reasoning hoặc audit text.
- Card freshness/update timestamp rendered như searchable words.

Source/freshness metadata vẫn được dùng cho eligibility, caveat, audit, source diversity và tie-break khi relevance tương đương; nó không tạo text match.

`searchVector` được indexing worker materialize atomically và GIN index trực tiếp trên
stored `tsvector` column. Không dùng `unaccent()` trong generated-column/expression-index
DDL nếu deployment target không chứng minh immutability requirements. Query construction
dùng cùng normalization/config và safe constructors như `plainto_tsquery` hoặc
`phraseto_tsquery`; không nối raw traveler text vào `to_tsquery`.

## Query resolution

### Deterministic entity parsing

1. Normalize Unicode/whitespace và build accent-preserving plus unaccented comparison forms.
2. Longest-match canonical alias lookup.
3. Prefer exact diacritic canonical match over unaccented alias.
4. Detect route connectors như `đến`, `tới`, `đi`, `-`, `→` nhưng không dùng connector làm relevance term.
5. Resolve entities against selected Trip Project anchors trước global aliases.
6. Ambiguous alias returns every bounded candidate and an ambiguity; không chọn location phổ biến nhất.
7. Typo/fuzzy alias resolution chỉ đề xuất entity; hard authority cần exact/reviewed mapping hoặc traveler confirmation.

### Facet parsing

- Explicit query terms map vào `TravelFacet` through versioned vocabulary.
- Task defaults chỉ tạo `useful`/`optional` facets, không biến mọi broad itinerary query thành yêu cầu tất cả facets.
- Trip constraints có thể nâng facet lên `required`, ví dụ EV -> `fuel_or_charging`, trẻ nhỏ -> `stop`/`activity` supporting needs.
- Freshness-sensitive request tạo `freshnessRequiredFacets` riêng; freshness không thay đổi geography.

### AI-assisted planning

AI planner chỉ nhận:

- normalized traveler question;
- bounded selected trip anchors/legs/constraints;
- canonical entity candidates với IDs;
- allowed intent/facet/constraint schema.

AI planner không nhận:

- raw source;
- full knowledge corpus;
- URLs/provider payload;
- operator-only context;
- authority để tạo location/path ID.

Invalid/missing/duplicate model output fail closed về deterministic plan và ambiguity question.

## Candidate eligibility và geographic applicability

### Eligibility predicate

Một card chỉ vào `policyEligibleCandidates` khi:

~~~text
card.lifecycle_state = active
AND current card content version matches active search projection
AND current evidence/source/capture remains traveler-eligible
AND Knowledge-owned eligibility snapshot state is contextual_use
AND geographic projection is current
AND facet projection is current
~~~

Eligibility được enforce ở indexing time và re-check ở query/final-render time.

### GeographicRelation v6

~~~ts
type GeographicRelationV6 =
  | "exact_route"
  | "on_selected_path"
  | "on_all_plausible_paths"
  | "on_some_plausible_paths"
  | "origin_local"
  | "destination_local"
  | "planned_stop_local"
  | "nationwide_applicable"
  | "corridor_general_soft"
  | "known_path_soft"
  | "off_route_before_origin"
  | "off_route_after_destination"
  | "off_selected_path"
  | "off_every_authoritative_path"
  | "scope_ambiguous"
  | "scope_unknown";
~~~

### Hard allow/exclude rules

- Selected/confirmed path:
  - exact segment on query subpath -> allow;
  - segment wholly before origin -> `off_route_before_origin`;
  - segment wholly after destination -> `off_route_after_destination`;
  - segment not on selected path -> `off_selected_path`.
- Complete OD alternatives:
  - on every path -> allow/high priority;
  - on some paths -> allow as path-dependent and request clarification when material;
  - off every path -> `off_every_authoritative_path`.
- Partial registry without selected path:
  - known matching path may create `known_path_soft`;
  - absence from known paths không đủ cho hard negative.
- Place card:
  - origin/destination/planned stop membership only;
  - sharing corridor alone không tạo local applicability.
- Nationwide card:
  - allow only when facet/intent matches;
  - lower priority than scoped evidence.
- Corridor-general claim:
  - `corridor_general_soft` only for claim allowlisted supporting facet;
  - never satisfies route/driving-segment premise by itself;
  - never creates place-local applicability;
  - absence/presence không cấp hard route decision.
- Ambiguous/unknown route/place card:
  - exclude from route-specific evidence;
  - không tự đổi thành generic advice.

### Interval classification

Với selected path, route edge traversal dùng half-open interval:

~~~text
query edges = [originLocationOrdinal, destinationLocationOrdinal)
card edges  = [startEdgeOrdinalInclusive, endEdgeOrdinalExclusive)
~~~

Forward direction:

- cardEndExclusive <= originLocationOrdinal -> before origin.
- cardStartInclusive >= destinationLocationOrdinal -> after destination.
- half-open edge intervals overlap and traversal compatible -> on route.
- no membership on selected path -> off selected path.

Segment bắt đầu tại destination node, ví dụ `Đà Nẵng -> Quy Nhơn` khi destination là
Đà Nẵng, có edge ordinal bằng `destinationLocationOrdinal` và vì vậy luôn
`off_route_after_destination`.

Reverse direction materialize một reversed edge sequence hợp lệ; không trộn forward node
ordinal, reverse node ordinal và edge ordinal trong cùng comparison.

Card spanning nhiều segments được allow nếu phần fact áp dụng cho interval giao với query; nếu summary/fact semantically nói toàn bộ segment ngoài interval, projection phải split hoặc giữ ambiguous, không dùng overlap để hợp thức hóa fact.

## Scope-first candidate retrieval

### Allowlist query

Candidate retrieval bắt đầu từ relational allowlist:

~~~text
BASE_CURRENT_ELIGIBLE
INTERSECT REQUESTED_FACET_ELIGIBLE
INTERSECT (
  AUTHORITATIVE_GEO_ELIGIBLE
  UNION KNOWN_PATH_OR_CORRIDOR_SOFT_ELIGIBLE
  UNION EXPLICIT_NATIONWIDE_APPLICABLE
)
~~~

Parentheses là contract. Nationwide/corridor/soft-path candidates vẫn phải qua base
lifecycle/evidence/policy eligibility và requested-facet eligibility. Integration tests
phải chứng minh SQL query plan không cho `UNION` branch bypass base filters.

Không chạy vector/AI trên hard-excluded candidates.

Khi route authority chưa đủ:

- giữ bounded candidates thuộc plausible known paths;
- giữ exact origin/destination/place matches;
- giữ explicit nationwide cards;
- không hard-label unknown card là on-route;
- hỏi route-style/path clarification nếu câu trả lời phụ thuộc khác biệt path.

### Facet pools

Mỗi candidate có thể xuất hiện trong một hoặc nhiều pools:

~~~text
route
driving_segment
stop
accommodation
food
activity
warning
fuel_or_charging
parking
cost
general
~~~

Pools là view của cùng card IDs, không duplicate card state. Candidate được final selector tính token cost một lần.

## Field-aware lexical retrieval

### PostgreSQL FTS baseline

Seed implementation:

~~~sql
setweight(to_tsvector('simple', unaccent(coalesce(title_text, ''))), 'A')
||
setweight(to_tsvector('simple', unaccent(coalesce(geography_text, ''))), 'A')
||
setweight(to_tsvector('simple', unaccent(coalesce(facet_text, ''))), 'B')
||
setweight(to_tsvector('simple', unaccent(coalesce(body_text, ''))), 'C')
~~~

Actual migration/query syntax phải được spike và test trên supported PostgreSQL target; snippet trên là seed, không phải migration đã phê duyệt.

Query signals:

- Exact canonical entity ID match.
- Exact normalized multi-word phrase.
- Exact card type/facet match.
- Phrase query cho meaningful non-entity phrase.
- `ts_rank_cd` hoặc evaluated equivalent cho weighted lexical relevance/proximity.
- Reviewed alias match.
- Constraint keyword match trong allowlisted fields.

Không score các component token của resolved entity độc lập. Sau khi `Hà Nội` resolve thành entity, `hà` và `nội` không tạo geographic relevance cho card khác.

### Fuzzy alias resolution

`pg_trgm`, nếu được phê duyệt, chỉ dùng để:

- đề xuất canonical alias khi traveler typo;
- rank ambiguous alias suggestions;
- log unresolved popular variants cho registry maintenance.

Fuzzy match không cấp hard route membership cho card/query nếu chưa exact/reviewed/confirmed.

### Seed lexical score

~~~text
lexicalScore =
    exactCanonicalEntitySignal
  + exactPhraseSignal
  + weightedFtsRank
  + facetSignal
  + constraintSignal
~~~

~~~ts
type CandidateFeatureVectorV6 = {
  exactCanonicalEntity: 0 | 1;
  exactPhrase: 0 | 1;
  weightedFtsRank: number; // normalized [0, 1]
  facetMatch: 0 | 1;
  constraintMatch: number; // normalized [0, 1]
  authoritativeScope: 0 | 1;
};

type RankingConfigV6 = {
  version: string;
  weights: Record<keyof CandidateFeatureVectorV6, number>;
  semanticBandThresholds: {
    highInclusive: number;
    lowExclusive: number;
  };
  missingValue: 0;
};
~~~

Mỗi component có range/missing semantics cố định và config immutable. Initial weights là
[ASSUMPTION] và phải tune trên evaluation set. Golden conformance vectors phải cho cùng
score/band/tie-break ở mọi implementation. Freshness, source count và card update time
không nằm trong lexical score.

## Optional semantic rescue

Vector retrieval không phải production prerequisite.

### Gate để thử embeddings

Chỉ spike embeddings khi field-aware FTS baseline có một trong các failure đã label:

- paraphrase recall thấp nhưng scope/facet labels rõ;
- Vietnamese synonym/semantic intent không match lexical vocabulary;
- recurring query class có must-include card bị mất ở candidate stage;
- corpus growth làm manual synonym vocabulary không còn hiệu quả.

### Embedding projection

~~~ts
type KnowledgeEmbeddingProjectionV6 = {
  cardId: string;
  contentVersion: number;
  textHash: string;
  embeddingModelId: string;
  embeddingModelVersion: string;
  dimension: number;
  distanceMetric: "cosine" | "inner_product";
  vector: number[];
  status: "active" | "disabled";
};
~~~

- Embedding input chỉ gồm card-owned safe semantic text.
- Vector identity gắn với `textHash + embeddingModelVersion`.
- Geography/policy change không bắt buộc recompute vector nếu semantic text không đổi; query filter hoặc status disable bảo vệ eligibility.
- Content text thay đổi thì vector stale/disable cho đến khi rebuild.
- Không đưa source labels, quotes, URLs, operator metadata hoặc policy instructions vào embedding.
- Bước 10 phải thêm provider/gateway embedding adapter; current chat completion gateway
  path không được giả định đã hỗ trợ embeddings.
- Model catalog/cutover contract phải pin model ID, dimension và distance metric. Model
  khác dimension dùng projection/index generation riêng; không dual-read vectors khác
  dimension như cùng score space.
- Với corpus hàng trăm card, exact pgvector scan bên trong scope allowlist là baseline;
  không thêm HNSW/IVFFlat nếu chưa có scale/latency evidence.
- `vector` extension có deployability/migration-role gate riêng.

### Hybrid và RRF gate

Chỉ dùng hybrid nếu vector-only candidate bổ sung relevant cards mà FTS không tìm được trên labeled eval cases.

So sánh bắt buộc:

- scope-first FTS only;
- scope-first vector only;
- union với deterministic score normalization;
- RRF;
- evaluated reranker nếu có.

RRF chỉ được chọn nếu tăng candidate recall/facet coverage mà không làm precision, latency, cost hoặc debuggability kém hơn chosen alternative.

## Deterministic high/low/grey decision

Sau allowlist và lexical/optional semantic retrieval:

~~~ts
type CandidateSemanticBand =
  | "high_confidence"
  | "grey_band"
  | "low_confidence";
~~~

Seed rules:

- `high_confidence`: authoritative scope match, eligible facet và strong exact/lexical signal.
- `low_confidence`: facet mismatch, no semantic contribution hoặc only generic token overlap.
- `grey_band`: scope/facet eligible nhưng semantic applicability của atomic fact chưa đủ rõ.

Thresholds/rules được versioned và tuned bằng eval. Hard geography/policy exclusions xảy ra trước semantic band và không thể thành grey band.

## Bounded AI grey-band adjudication

~~~ts
type EvidenceRequirementKeyV6 = {
  id: string;
  facet: TravelFacet;
  legId?: string;
  locationId?: string;
  constraintId?: string;
  freshnessClass?: "static" | "fresh";
};

type CardSemanticDecisionV6 = {
  cardId: string;
  applicable: boolean;
  contributions: Array<{
    requirementKeyId: string;
    relevance: "essential" | "useful" | "optional" | "irrelevant";
    reasonCode:
      | "direct_query_evidence"
      | "constraint_match"
      | "facet_support"
      | "redundant"
      | "facet_mismatch"
      | "insufficient_context";
  }>;
};
~~~

AI không trả:

- geographic relation;
- policy;
- `requiresCaveat`;
- route/path ID mới;
- source selection;
- persistence instruction.

Server validation:

- exactly one decision per input candidate;
- no unknown/duplicate card ID;
- contribution chỉ được reference server-supplied candidate-to-requirement edges;
- AI không tạo facet/requirement key mới hoặc làm một leg satisfy leg khác;
- decision không thay đổi deterministic caveat/policy/geography;
- invalid batch fail closed;
- deterministic high-confidence candidates vẫn dùng được nếu AI grey-band batch fail;
- grey-band candidates fail về not-selected, không fail-open.

AI adjudication chỉ productionize khi precision/facet coverage uplift vượt exact
`RetrievalGateProfileV6.minimumExperimentUplift`, regressions/call rate/latency/cost
nằm trong cùng pinned gate profile.

## Facet-aware evidence selection

### Evidence requirements

Query plan chuyển thành:

~~~ts
type EvidenceRequirement = {
  key: EvidenceRequirementKeyV6;
  importance: "required" | "useful" | "optional";
  minimumEvidence: 0 | 1;
  freshnessRequired: boolean;
  contributions: Array<{
    cardId: string;
    requirementKeyId: string;
  }>;
  status: "satisfied" | "missing" | "requires_verification";
};
~~~

`minimumEvidence` không phải type quota. Nó biểu diễn liệu answer có cần ít nhất một premise
hợp lệ cho exact facet/leg/location/constraint requirement. Card route cho leg 1 không
được mark route requirement của leg 2 là satisfied.

### Marginal coverage objective

Final selector chạy deterministic greedy constrained selection:

~~~text
marginalGain(card | selected) =
    relevanceGain
  + authoritativeScopeGain
  + newlyCoveredRequiredFacetGain
  + newlyCoveredUsefulFacetGain
  + constraintMatchGain
  + evidenceQualityTieBreak
  - redundancyPenalty
  - tokenCostPenalty
~~~

Constraints:

- policy/geography hard eligibility;
- only `contextual_use` internal cards;
- whole-card render cost;
- total source budget;
- bounded source-handle capacity;
- current version/projection;
- one card counted once even if it covers multiple facets.

Selection loop:

1. Chọn card có positive marginal gain cao nhất.
2. Update covered facets/constraints và remaining budget.
3. Recompute marginal gain.
4. Dừng khi không còn positive gain hoặc budget hết.
5. Persist selected order và reason contributions.

Deterministic tie-break:

1. Required facet gain.
2. Authoritative geographic specificity.
3. Semantic relevance.
4. Lower token cost.
5. Stable card ID.

Source freshness/quality chỉ là tie-break hoặc caveat input sau relevance/scope; freshness không nâng off-scope card.

### Redundancy

Seed redundancy signals:

- same canonical fact/relation fingerprint nếu có;
- high normalized title+summary lexical overlap;
- same facet + same place/segment + materially equivalent summary.

Embedding cosine chỉ dùng cho redundancy nếu vector stage đã được approved; không thêm embeddings chỉ để dedupe corpus nhỏ.

## Missing facet và web fallback

Gap analysis chạy sau internal card selection nhưng trước final packing.

~~~ts
type EvidenceGap = {
  requirementKey: EvidenceRequirementKeyV6;
  reason:
    | "no_scope_eligible_card"
    | "no_semantically_applicable_card"
    | "freshness_verification_required"
    | "budget_excluded";
  mayUseWeb: boolean;
  requiresClarification: boolean;
};

type WebEvidenceItemV6 = {
  captureId: string;
  resultPayloadHash: string;
  provider: string;
  capturedAt: string;
  requirementKeyId: string;
  scopeStatus:
    | "authoritative_scope_match"
    | "explicit_nationwide_general"
    | "scope_unresolved"
    | "scope_mismatch";
};
~~~

Rules:

- Web fallback query được build per missing/fresh facet với resolved canonical names/path style; không chỉ gửi nguyên broad question.
- Web result luôn external/unverified cho đến khi ingested qua Knowledge.
- Route/place factual web evidence chỉ làm premise khi canonical scope resolver xác nhận
  authoritative subpath/place. `scope_unresolved` giữ vai trò verification lead/gap,
  không làm premise; `scope_mismatch` bị loại.
- Explicit nationwide/general web result đi qua pool riêng và không thay route/place evidence.
- Web query chỉ gửi minimum resolved geography/facet/freshness terms cần thiết; private
  child/budget/preferences/trip notes không được gửi nếu không thật sự cần cho query.
- Missing non-fresh facet có thể trả lời bằng safe general reasoning nếu answer nói rõ limitation.
- Missing required facet không được silently omitted.
- Web failure giữ gap và tạo verification/uncertainty wording; không bịa đã search.
- Internal and web items được joint-pack sau gap retrieval để cùng chịu budget/source-handle limit.

## Contextual compression và prompt packing

### Card render unit

Mỗi rendered card giữ:

- card ID và content version;
- fact/title và bounded summary;
- canonical geography relation;
- contributing facet;
- conditions;
- policy instruction/caveat;
- allowlisted practical details liên quan;
- bounded evidence/source identity theo display policy;
- freshness/verification instruction.

Trước selection, renderer tạo bounded variants:

~~~ts
type RenderVariantV6 = {
  renderVariantId: string;
  itemKind: "knowledge_card" | "web_evidence";
  itemId: string;
  itemVersion: string;
  serialization: string;
  renderTextHash: string;
  tokenizerVersion: string;
  tokenCount: number;
};
~~~

Selector chọn exact render variant, không chọn abstract card rồi để packer tự đổi
full/compact/minimal content. Token cost, fact content và provenance vì vậy không drift
sau selection.

Không render:

- raw source;
- operator-only notes;
- retrieval score internals cho answer model nếu không cần;
- discarded candidate list;
- model reasoning;
- source metadata không liên quan đến display/policy.

### Packing order

1. Required selected internal evidence.
2. Required freshness web evidence với unverified caveat.
3. Useful selected internal evidence.
4. Useful web evidence.
5. Optional internal evidence nếu còn budget.
6. General reasoning instruction.

Whole variant không vừa budget thì thử một precomputed smaller variant đã qua cùng
validation; nếu vẫn không vừa thì omit và ghi `budget_excluded`. Không truncate giữa
card/evidence hoặc tạo ad-hoc variant sau selection.

### Final re-check

Ngay trước render:

- card content version;
- lifecycle/evidence/source eligibility;
- policy;
- geo/facet projection versions;
- route registry version compatibility;
- selected query-plan version.

AI Orchestration tạo `PromptRenderManifest` atomically trong một consistent database
snapshot trước external model call. Manifest pin exact eligibility/content/evidence,
projection, caveat, web capture và render variant identities.

Sau generation nhưng trước terminal delivery, Orchestration re-check hard revocation
(withdrawn source/evidence, lifecycle/policy change). Nếu một required premise bị revoke:

- discard generated output;
- rebuild về explicit gap/clarification/fail-safe nếu request deadline cho phép;
- không deliver answer như thể requirement vẫn satisfied;
- không thay bằng candidate chưa qua selection.

## Retrieval snapshot và provenance

### Bounded candidate snapshot

~~~ts
type RetrievalReasonCodeV6 =
  | "lifecycle_ineligible"
  | "evidence_ineligible"
  | "policy_ineligible"
  | "projection_stale"
  | "exact_route_match"
  | "origin_local"
  | "destination_local"
  | "planned_stop_local"
  | "off_route_before_origin"
  | "off_route_after_destination"
  | "off_selected_path"
  | "off_every_authoritative_path"
  | "path_dependent"
  | "route_registry_partial"
  | "route_path_unresolved"
  | "corridor_general_soft"
  | "known_path_soft"
  | "scope_ambiguous"
  | "scope_unknown"
  | "facet_inapplicable"
  | "lexical_no_match"
  | "semantic_low_confidence"
  | "semantic_grey_rejected"
  | "semantic_ai_invalid"
  | "redundant"
  | "selected_for_requirement"
  | "budget_excluded"
  | "source_handle_capacity_excluded"
  | "final_version_stale"
  | "rendered"
  | "web_gap_triggered"
  | "gap_unresolved";

type RetrievalCandidateSnapshotV6 = {
  cardId: string;
  contentVersion: number;
  eligibilitySnapshotId: string;
  policy: "contextual_use";
  geographicRelation: GeographicRelationV6;
  eligibleFacets: TravelFacet[];
  semanticBand?: CandidateSemanticBand;
  selected: boolean;
  rendered: boolean;
  reasonCode: RetrievalReasonCodeV6;
};

type PromptRenderManifestItemV6 = {
  itemKind: "knowledge_card" | "web_evidence";
  itemId: string;
  itemVersion: string;
  requirementKeyIds: string[];
  renderVariantId: string;
  renderTextHash: string;
  eligibilitySnapshotId?: string;
  evidenceSetRevision?: number;
  caveatVersion?: string;
  webCaptureId?: string;
  webResultPayloadHash?: string;
};
~~~

Persistence policy:

- Persist `QueryExecutionContextV6`, bounded sanitized query plan/hash, exact trip snapshot
  reference, resolved authority, config versions, counts per stage, selection manifest,
  prompt render manifest và exact provenance rows.
- Persist reason codes for selected/rendered and bounded top rejected candidates.
- Persist aggregate excluded counts for the remaining population.
- Full candidate traces chỉ cho versioned evaluation runs hoặc bounded diagnostic sampling; không mặc định lưu toàn corpus candidate list cho mọi query.
- Không persist raw AI reasoning.
- `usedInPrompt` được derive từ immutable PromptRenderManifest; không phải mutable flag
  mà Search/Retrieval có thể update độc lập.
- Card provenance pin content/evidence/eligibility/render variant; web provenance pin
  immutable capture ID, payload hash, provider và captured time.
- Answer provenance withdrawal/removal contract hiện hữu tiếp tục áp dụng.

## Failure behavior

| Failure | Safe behavior |
|---|---|
| Query plan AI unavailable | Dùng deterministic plan; giữ ambiguity |
| Alias/entity ambiguous | Không invent ID; hỏi làm rõ khi material |
| Route path unresolved | Disable route hard exclusion; chỉ exact place + explicit nationwide/general evidence |
| Registry partial | Soft positive trên known paths; không hard negative do absence |
| Card geo/facet projection stale | Exclude khỏi hard route/facet evidence |
| FTS unavailable | Bounded deterministic exact/field-aware fallback trong allowlist |
| Embedding stale/unavailable | FTS baseline tiếp tục; không fail answer |
| AI grey-band batch invalid | Bỏ grey-band; giữ deterministic high-confidence |
| Web search unavailable/low quality | Giữ gap và verification wording |
| Prompt budget insufficient | Whole-item omission + budget reason |
| Final policy/version changed | Omit stale card; không thay fail-open |

## Evaluation contract

### Dataset

Versioned Vietnamese travel evaluation set phải có:

- direct place query;
- forward/reverse route query;
- route truncated at destination;
- route starting mid-corridor;
- multiple plausible path styles;
- selected Trip Project path;
- partial registry case;
- multi-leg itinerary;
- family/child constraints;
- EV/fuel/charging;
- accommodation/food/activity;
- parking/cost;
- freshness-sensitive facts;
- ambiguous aliases;
- typo/diacritic variants;
- broad planning queries;
- source-metadata collision;
- duplicate/redundant facts;
- operator-required/conflicted/stale projection exclusion cases;
- prompt-budget pressure.

Mỗi case định nghĩa:

~~~ts
type TripContextFixtureV6 = {
  tripSnapshotId: string;
  aggregateVersion: number;
  anchors: Array<{
    id: string;
    role: "origin" | "destination" | "required_stop";
    canonicalLocationId?: string;
    state: "idea" | "planned" | "confirmed";
  }>;
  legs: Array<{
    id: string;
    originLocationId?: string;
    destinationLocationId?: string;
    selectedPathId?: string;
    state: "idea" | "planned" | "confirmed";
  }>;
  constraints: TypedTravelConstraints | null;
};

type CorpusFixtureManifestV6 = {
  id: string;
  registrySnapshotId: string;
  facetVocabularyVersion: string;
  cards: Array<{
    cardId: string;
    contentVersion: number;
    evidenceSetRevision: number;
    geoProjectionGeneration: string;
    facetProjectionGeneration: string;
    searchProjectionGeneration: string;
  }>;
};

type RetrievalEvaluationCaseV6 = {
  id: string;
  question: string;
  corpusFixtureManifestId: string;
  tripContextFixture?: TripContextFixtureV6;
  expectedQueryPlan: {
    entityIds: string[];
    legPairs: Array<[string, string]>;
    facets: TravelFacet[];
    ambiguityCodes?: string[];
  };
  expectedStageDecisions: Array<{
    cardId: string;
    stage: "eligibility" | "geography" | "candidate" | "selected" | "rendered";
    expected: "include" | "exclude" | "may_include";
    requirementKeyId?: string;
    reasonCode?: RetrievalReasonCodeV6;
  }>;
  mustRenderCardIds?: string[];
  mustNotRenderCardIds: string[];
  requiredRequirementKeyIds: string[];
  allowedWebFallbackRequirementKeyIds?: string[];
};
~~~

Dataset/corpus manifests là immutable. Eval result pin exact manifest, config và execution
context; mutable current cards/registry không được làm historical run đổi nghĩa.

### Metrics

#### Off-route leakage rate

~~~text
rendered hard-off-route cards
/
all rendered route-scoped internal cards
~~~

Target cho authoritative route cases: zero trong release gate.

#### Route-scope precision

~~~text
rendered route-scope-applicable cards
/
all rendered route-scoped internal cards
~~~

Chỉ tính cases có ground-truth authoritative path/alternatives.

#### Hard-filter false exclusion rate

~~~text
must-include cards hard-excluded before lexical retrieval
/
all must-include cards
~~~

Metric này bảo vệ recall khỏi route registry/parser quá tự tin.

#### Candidate recall

~~~text
must-include cards present after candidate generation
/
all must-include cards
~~~

Report theo overall và per facet/query class.

#### Final-set precision

~~~text
rendered relevant cards
/
all rendered internal cards
~~~

#### Required-facet coverage

~~~text
satisfied required requirement keys
/
all required requirement keys
~~~

Missing facet có explicit gap không tính là covered nhưng được đánh giá riêng về safe behavior.

#### Source-metadata leakage rate

Số cases mà source/provenance-only token làm card được retrieve hoặc nâng hạng / tất cả source-metadata collision cases.

Target: zero.

#### Provenance correctness

- Every rendered item has correct provenance.
- No unrendered item is marked used in prompt.
- Persisted card/source versions match render.
- Withdrawn/stale evidence cannot remain available.

#### Operational metrics

- p50/p95/p99 per stage.
- AI planner/adjudicator call rate.
- AI invalid/fallback rate.
- web fallback rate per facet/reason.
- candidate counts at policy/scope/lexical/semantic/selected/rendered stages.
- prompt tokens by context/internal/web/general.
- cost per successful answer and per stage.

### Versioned gate profile

Bước 0 phải tạo `RetrievalGateProfileV6` trước khi Bước 4/5 production work bắt đầu:

~~~ts
type RetrievalGateProfileV6 = {
  version: string;
  cohorts: Array<{
    cohort: string;
    minimumCandidateRecall: number;
    maximumHardFilterFalseExclusion: number;
    minimumFinalSetPrecision: number;
    minimumRequiredRequirementCoverage: number;
  }>;
  maximumP95StageLatencyMs: Record<string, number>;
  maximumP95TotalLatencyMs: number;
  maximumAiCallRate: number;
  maximumWebCallRate: number;
  maximumCostPerSuccessfulAnswer: number;
  minimumExperimentUplift: number;
  maximumAllowedRegression: number;
  evidenceWindow: {
    minimumRunCount: number;
    minimumDurationHours: number;
  };
};
~~~

Numeric values có thể được benchmark/approve ở Bước 0, nhưng mọi later gate phải reference
exact profile version; không dùng cụm `approved threshold` hoặc `agreed threshold` không
có machine-readable identity.

### Required ablations

- Current token matcher.
- Source-metadata-isolated token matcher.
- Scope-first exact/field-aware lexical.
- Scope-first weighted FTS.
- FTS + facet selector.
- FTS + optional vector.
- FTS + vector + fusion.
- Deterministic vs grey-band AI.

Không productionize stage mới nếu ablation không cho biết stage đó sửa failure class nào.

## Test boundaries

### Unit tests

Dùng `pnpm test:unit` cho:

- Unicode/entity normalization.
- Longest alias matching.
- route sequence/interval classifier.
- facet/type mapping.
- query-plan schema validation.
- semantic band rules.
- marginal coverage selection.
- prompt whole-item packing.
- reason-code mapping.

Unit tests không cần PostgreSQL hoặc environment database.

### Integration tests

Dùng `pnpm test:integration` cho:

- Drizzle schema/migrations/index definitions.
- search projection lifecycle.
- source-metadata isolation.
- actual PostgreSQL FTS behavior.
- unaccent/pg_trgm deployability nếu dùng.
- policy/evidence re-check.
- scope-first SQL allowlist.
- version fencing/stale projection.
- final provenance persistence.
- evaluation harness against real index/config/query.

Mỗi integration suite cần clean tables phải tự gọi `resetTestDatabase()`. Suite giữ serial trên một physical test database.

## Telemetry reason codes

### Eligibility

- `lifecycle_ineligible`
- `evidence_ineligible`
- `policy_ineligible`
- `projection_stale` with typed stage detail

### Geography

- `exact_route_match`
- `origin_local`
- `destination_local`
- `planned_stop_local`
- `off_route_before_origin`
- `off_route_after_destination`
- `off_selected_path`
- `off_every_authoritative_path`
- `path_dependent`
- `route_registry_partial`
- `route_path_unresolved`
- `scope_ambiguous`
- `scope_unknown`
- `corridor_general_soft`
- `known_path_soft`

### Semantic/facet

- `facet_inapplicable`
- `lexical_no_match`
- `semantic_low_confidence`
- `semantic_grey_rejected`
- `semantic_ai_invalid`
- `redundant`
- `selected_for_requirement` with requirement key and importance detail

### Rendering

- `budget_excluded`
- `source_handle_capacity_excluded`
- `final_version_stale`
- `rendered`
- `web_gap_triggered`
- `gap_unresolved`

## Rollout strategy

Không big-bang cutover và không dual-write product aggregate.

~~~ts
type RetrievalReadMode = "legacy" | "v6_shadow" | "v6_active";
~~~

- Mode/config identity nằm trong existing versioned database/config mechanism, không
  phụ thuộc process-local environment toggle.
- Mỗi request pin exact mode và runtime/gate/ranking/selector versions.
- `v6_shadow` không gọi web/model, không ghi prompt usage/provenance và không ảnh hưởng
  traveler answer; chỉ ghi bounded evaluation-safe comparison telemetry.
- Mixed-node deploy chỉ được phép khi old/new readers hiểu active projection generation;
  nếu không, migration dùng expand/backfill/activate/cutover/contract sequence.
- Legacy read path chỉ retire sau exact `RetrievalGateProfileV6.evidenceWindow`.
- Rollback trigger là bất kỳ release-gate regression nào; rollback chuyển read mode,
  không rollback destructive schema/data.

### Shadow/evaluation preparation

- Thêm evaluation fixtures/datasets trước.
- Tạo reference registry và projections như derived state.
- Backfill projection bằng existing Worker workload nhưng job identity/fence mới phải
  include projection generation; current `(cardId, contentVersion)` marker không đủ.
- Run query-plan/scope classifier trên evaluation/staging; không ảnh hưởng answer production.
- Compare current retrieval và v6 offline/shadow telemetry với bounded safe identifiers.

### Production read cutover

1. Deploy schema/migration trước dependent workloads.
2. Backfill current eligible cards.
3. Verify zero stale/missing projections cho cutover corpus hoặc fail readiness.
4. Enable scope-first allowlist + field-aware lexical read path.
5. Keep deterministic fallback trong same deployment.
6. Observe leakage/recall/latency.
7. Retire obsolete target-count/token matcher semantics sau evidence window.

Không thêm new external service hoặc environment flag nếu code/config release sequencing giải quyết được.

### Optional stage rollout

Embeddings, RRF hoặc AI grey-band stage có rollout riêng:

- offline eval;
- staging shadow;
- bounded production sampling nếu approved;
- compare quality/latency/cost;
- explicit go/no-go;
- remove experiment projection/config nếu không đạt gate.
- Embedding work dùng per-item claim hoặc renewable fenced lease; không để remote provider
  latency làm later items trong batch hết lease.

## Roadmap triển khai

### Bước 0: Evaluation-first baseline và immediate leakage isolation

Mục tiêu: có ground truth trước khi thay thuật toán, đồng thời sửa lỗi source metadata rõ ràng.

Công việc:

- Tạo evaluation schema/dataset v6 với must-include/must-exclude/must-render/must-not-render.
- Tạo immutable CorpusFixtureManifest và typed TripContext fixtures.
- Định nghĩa chính xác metric denominators và query cohorts.
- Benchmark và approve numeric `RetrievalGateProfileV6`.
- Chốt/update PRD sparse-web contract: unsatisfied requirement keys thay `< 3`; production
  giữ compatibility count trigger cho đến khi PRD/architecture update được approved.
- Chốt policy alignment: `operator_required/caveat_only` bị exclude khỏi internal
  retrieval theo PRD/AD-17 và chỉ tạo gap/web verification signal.
- Thêm mandatory cases:
  - Hà Nội -> Đà Nẵng exclude Đà Nẵng -> Quy Nhơn;
  - reverse direction;
  - source label chứa query location nhưng card fact off-route;
  - generic itinerary tokens không nâng off-route card.
- Loại source/provenance fields khỏi `buildSearchableText`.
- Tách stage counts/reason codes trong telemetry.
- Baseline current token matcher trước và sau metadata isolation.

Acceptance:

- Source metadata leakage rate = 0 trên collision fixtures.
- Evaluation bắt được off-route rendered candidate.
- Provenance ledger phân biệt candidate/selected/rendered.
- Không cần FTS/vector/AI để hoàn tất bước này.

Gate:

- Không triển khai route hard-filter production nếu chưa có hard-filter false-exclusion metric.
- Không triển khai Bước 4/5 production nếu chưa có versioned numeric gate profile và
  approved PRD/architecture updates cho changed web/policy contracts.

### Bước 1: Shared query/facet contracts

Mục tiêu: mọi module dùng cùng vocabulary và typed query scope.

Công việc:

- Thêm shared `TravelFacet`, `TravelQueryPlanV6`, typed constraints và validation.
- Version card type -> facet mapping.
- Implement deterministic Vietnamese entity/facet parser baseline.
- Load allowlisted Trip Project anchors/legs/constraints.
- Persist/query-plan telemetry version, không persist raw reasoning.
- Add ambiguity behavior và concise clarification contract.

Acceptance:

- Multi-word entities resolve atomically.
- Multi-leg query không bị ép thành một origin/destination pair.
- EV/family constraints tạo đúng required/useful facets.
- Unknown constraint keys không vào retrieval/model.
- Deterministic plan chạy được khi AI planner unavailable.

### Bước 2: Minimal canonical route registry

Mục tiêu: deterministic product-domain route scope không phụ thuộc text similarity.

Công việc:

- Tạo versioned locations/aliases, physical segments, paths và memberships.
- Tạo OD coverage assertions.
- Seed only supported product locations/segments/path alternatives.
- Implement forward/reverse traversal validation.
- Define Trips-owned canonical refs/confirmation contract; cho đến khi implemented,
  current free-text labels không cấp confirmed path authority.
- Không tạo GIS/distance/live routing.

Acceptance:

- Shared segment giữa standard/coastal/scenic paths giữ một segment ID.
- Hà Nội -> Đà Nẵng subpath resolve đúng endpoints/direction.
- Reverse query tạo reversed usable sequence hoặc unresolved.
- Partial registry không hard-exclude theo absence.
- Complete OD/selected path cho phép classify before/after/off-path.

Gate:

- Registry validation pass; no broken segment/location sequence.

### Bước 3: Card geography/facet/search projections

Mục tiêu: current, replayable derived state cho allowlist và lexical retrieval.

Công việc:

- Add versioned geo/facet/search projections.
- Deterministic exact alias/route parser.
- Operator-reviewed status qua existing operational process hoặc code-reviewed registry; không cần admin UI mới trong tranche.
- Mở rộng derived projection work identity thành
  `(cardId, contentVersion, evidenceSetRevision, projectionGeneration)`; không tái sử
  dụng current unique `(cardId, contentVersion)` marker nguyên trạng.
- Registry release đi qua draft -> validate -> atomic activate; activation tạo durable
  rebuild generation/fan-out, theo dõi completeness và có non-destructive rollback về
  prior active snapshot/read mode.
- Separate semantic text hash from geo/policy version.
- Add stale projection fail-closed behavior.

Acceptance:

- `Đà Nẵng - Quy Nhơn` maps exact/reviewed segment IDs hoặc remains ambiguous; không map nhầm nationwide.
- Source metadata absent khỏi search text/vector input.
- Projection carries exact compatibility set và generation.
- Registry/taxonomy/search-algorithm bump rebuild được card dù contentVersion không đổi.
- Card lifecycle/content/geography change tạo correct rebuild/disable.

### Bước 4: Scope-first relational allowlist

Mục tiêu: off-route/policy/facet candidates bị loại trước lexical/vector/AI.

Công việc:

- Implement eligibility predicate.
- Implement interval/path relation classifier.
- Implement selected path, complete alternatives và partial registry modes.
- Implement exact place/origin/destination/planned-stop rules.
- Implement explicit nationwide pool.
- Add query-stage counts và reason codes.

Acceptance:

- Hà Nội -> Đà Nẵng excludes Đà Nẵng -> Quy Nhơn trước semantic retrieval khi authority đủ.
- Destination-local food/hotel eligible only for destination facets.
- Unknown route/place card không trở thành generic advice.
- Partial registry preserves recall and emits `route_registry_partial`.
- No policy/geography hard-excluded card reaches AI.

Gate:

- Zero off-route leakage và zero hard-filter false exclusion trên authoritative release cases.

### Bước 5: Weighted field-aware PostgreSQL FTS

Mục tiêu: phrase/entity/facet-aware lexical relevance trong allowlist.

Công việc:

- Spike `simple + unaccent` on exact deployment PostgreSQL version/provider.
- Readiness kiểm tra extension availability và migration-role quyền
  `CREATE EXTENSION unaccent`/`pg_trgm`; failure không được xuất hiện lần đầu ở production migration.
- Worker materialize stored weighted `tsvector` atomically; GIN index chỉ trên stored
  column. Không bind generated-column/expression-index DDL vào volatile `unaccent()`.
- Add column/index through Drizzle migration và reviewed raw SQL helper khi Drizzle
  không biểu diễn được operation.
- Exact canonical entity and phrase signals outside raw FTS rank.
- Use `plainto_tsquery`/`phraseto_tsquery` for sanitized query construction; không
  concatenate raw traveler input vào `to_tsquery`.
- Optional `pg_trgm` only for alias/typo resolution.
- Compare against field-aware non-FTS baseline.

Acceptance:

- Diacritic/unaccent queries retrieve same canonical entities without token fragment leakage.
- `Cam Lộ - La Sơn` treated as phrase/entity.
- Generic `lịch trình/tư vấn/gợi ý` không tạo geographic score.
- FTS candidate recall improves or equals baseline without precision regression.

Gate:

- Deployment/migration/index behavior verified in integration tests.
- Indexing worker and request query use exact same text-search config/normalization version.

### Bước 6: Facet pools và marginal coverage selector

Mục tiêu: final internal evidence set covers traveler need under budget.

Công việc:

- Build requested evidence requirements.
- Rank within facet pools.
- Implement marginal gain/greedy selection.
- Add redundancy and whole-card token-cost estimation.
- Replace obsolete target-count/type-quota decisions only after Bước 0 PRD sparse-web
  update is approved; trước đó giữ compatibility `< 3` trigger nhưng không dùng count
  để chọn off-scope/internal evidence.
- Persist selected contribution/reason.

Acceptance:

- Broad itinerary có route/stop/warning coverage khi evidence tồn tại.
- Ba cards cùng facet không lấn card required facet chỉ vì score gần nhau.
- Card covering two facets counted/rendered once.
- Missing facet remains explicit.
- Selection deterministic under same versions/query plan.

### Bước 7: Gap-aware web fallback và joint packing

Mục tiêu: external search đúng facet và được pack/provenance an toàn.

Công việc:

- Detect missing/fresh facet trước final pack.
- Build scoped web query per facet.
- Post-filter result quality/geographic terms.
- Joint-pack internal/web items theo priority.
- Preserve unverified/freshness caveat.
- Verify rendered-only usage ledger.

Acceptance:

- Fresh route warning triggers scoped web fallback.
- Missing food facet không tự gọi unrelated broad search nếu not required/fresh.
- Web failure produces explicit inability-to-verify wording.
- Unrendered web/internal items not marked used in prompt.

### Bước 8: Prompt budget và provenance scale

Mục tiêu: tăng evidence capacity mà không mất scope/attribution correctness.

Công việc:

- Separate history/internal/web/general budgets.
- Whole-item compact/minimal variants.
- Bound source handles and diagnostic snapshots.
- Final version/policy/projection re-check.
- Withdrawal/removal regression tests.

Acceptance:

- Prompt never contains partial card.
- Every used source handle resolves exact rendered item.
- Budget omission reason distinct from relevance/scope omission.
- Source removal disables future use and preserves current withdrawal contract.

### Bước 9: AI grey-band experiment

Mục tiêu: chỉ dùng AI khi deterministic relevance chưa đủ.

Prerequisite:

- Scope-first FTS + facet selector production baseline đã đo.
- Labeled grey-band failure cases tồn tại.

Công việc:

- Define high/low/grey rules.
- Implement bounded schema call and batch validation.
- Measure call rate, precision uplift, false exclusion, latency, cost.
- Deterministic fallback.

Acceptance:

- AI call rate thấp hơn adjudicate-all design.
- No AI output can change geography/policy/caveat.
- Invalid batch cannot add evidence.
- Quality uplift vượt pinned gate-profile experiment threshold.

Gate:

- Nếu uplift không đủ, bỏ stage và giữ deterministic pipeline.

### Bước 10: Embedding/hybrid experiment

Mục tiêu: cứu measured semantic recall gaps, không thêm vector theo mặc định.

Prerequisite:

- FTS miss cases đã label.
- Vietnamese model candidates/data policy/deployability đã benchmark.

Công việc:

- Add lifecycle-safe embedding projection keyed by text hash/model version.
- Add gateway/provider embedding adapter, model catalog dimension/distance contract và
  projection-generation cutover strategy.
- Query vector only inside scope allowlist.
- Compare union/normalized fusion/RRF.
- Measure candidate recall, facet coverage, latency, cost và operational burden.

Acceptance:

- Vector adds unique relevant candidates.
- No source/operator metadata leakage.
- Policy/geo changes disable/filter without hidden stale eligibility.
- Hybrid beats FTS-only on approved metrics.

Gate:

- Không đạt thì không productionize pgvector retrieval path cho cards.

### Bước 11: Topic briefs only with density evidence

Mục tiêu: giảm prompt inefficiency khi nhiều atomic facts lặp theo route/topic.

Prerequisite:

- Measured prompt density/redundancy problem.
- Atomic selector/compression không đủ.

Rules:

- Brief là versioned derived projection over exact card IDs/content versions.
- Supporting card stale/ineligible làm brief stale.
- Brief không thay policy/geography authority.
- Provenance vẫn resolve đến supporting facts.

### Bước 12: Traveler memory evaluation

Mục tiêu: cải thiện memory hiện hữu, không thêm framework mới.

Contract:

~~~ts
type TravelerMemorySnapshotV6 = {
  id: string;
  userId: string;
  conversationId: string;
  tripProjectId: string | null;
  tripAggregateVersion: number | null;
  records: Array<{
    recordId: string;
    recordVersion: number;
    field: string;
    value: string;
    scope: "conversation" | "trip_project";
    authority: "selected_trip" | "current_conversation";
    sourceMessageId?: string;
  }>;
  conflicts: Array<{
    field: string;
    selectedTripRecordId: string;
    lowerPriorityRecordId: string;
  }>;
  serializationHash: string;
};
~~~

Precedence:

1. User-confirmed selected Trip Project structured state.
2. Current conversation correction that has not yet mutated selected Trip state, exposed
   as a conflict/clarification rather than silent override.
3. Current conversation travel context.
4. General prior conversation memory only when same scoped question needs it.

Correction/supersession:

- A correction creates a versioned replacement/supersession relation; old value không
  tiếp tục xuất hiện trong new retrieval/query plan.
- Selected Trip state chỉ đổi qua owner-confirmed command, không vì memory extractor.
- Conflicting chat fact không silently override confirmed trip constraint/path.

Deletion/invalidation:

- Conversation deletion removes owned chat-context records và invalidates derived memory,
  query-plan diagnostic payloads và evaluation/shadow snapshots có thể reconstruct content.
- Trip Project deletion removes Trip-owned constraints/plan context and invalidates
  derived retrieval snapshots under existing deletion contract.
- Aggregate/conversation version mismatch fail closed; không reuse stale memory snapshot.

Metrics:

- extraction accuracy;
- correction/supersession accuracy;
- question relevance;
- selected trip vs chat priority;
- deletion compliance;
- follow-up continuity;
- privacy/sensitive-field safety;
- memory-induced retrieval scope errors.

Improvements:

- Typed allowlisted memory fields.
- Use only relevant memory in query planning.
- Prevent stale chat fact overriding selected Trip Project state.
- Preserve user correction and deletion behavior.

Fixtures:

- corrected child age/preferences;
- selected Trip route vs conflicting chat route;
- deleted conversation;
- deleted Trip Project;
- follow-up relying on same-trip driving tolerance;
- unrelated prior-chat preference that must not leak;
- sensitive/unallowlisted field rejection.

Acceptance:

- Snapshot precedence deterministic và replayable.
- Corrected/superseded value không vào later query plan.
- Deletion integration tests chứng minh owner data và derived retrievable state biến mất.
- Memory-induced hard route/facet error rate meets pinned gate profile.
- Không thêm new memory table/framework nếu current owner records và snapshots đáp ứng contract.

### Bước 13: Reconsider only with evidence

- Cross-encoder/late-interaction reranker: only if FTS/vector/grey-band remain weak.
- GraphRAG: only for measured multi-hop failures not solved by route registry/facet planning.
- Autonomous tools: only when bounded orchestration cannot solve demonstrated tasks.
- External memory framework: only for persistent measured failures current model cannot fix.
- GIS/dynamic routes: requires separately approved product scope and provider architecture.

## Release gates

### Scope correctness gate

- Zero rendered hard-off-route cards in authoritative release dataset.
- Zero source-metadata leakage cases.
- Hard-filter false exclusion meets pinned gate profile; must-include critical route cards cannot be hard-excluded.

### Facet quality gate

- Required requirement-key coverage meets pinned gate profile by cohort.
- Missing facets produce explicit gap behavior.
- Final-set precision does not regress.

### Safety/provenance gate

- Only active evidence-eligible cards used.
- Operator-required/caveat-only code states are excluded from internal retrieval and
  represented only as gap/web-verification triggers.
- Rendered-only provenance is exact.
- Source removal/stale projection fail closed.

### Operational gate

- p95 stage/total latency within AI Ask budget.
- AI/web call rate and cost bounded.
- Index/backfill/Worker fencing/retry behavior demonstrated.
- No new deployment component required.

## Deferred decisions

### Full GIS hoặc dynamic route provider

Không build trong retrieval roadmap. Static product-domain registry chỉ xác lập applicability cho supported planning knowledge; nó không đại diện live navigation.

### Automatic near-route

Không dùng radius/distance inference. Một place chỉ `planned_stop_local` khi traveler/Trip Project chọn stop hoặc registry có explicit reviewed membership.

### RRF

Không mặc định dùng. Chỉ chọn sau ablation chứng minh multiple retrievers bổ sung nhau và RRF tốt hơn simpler union/normalized fusion.

### ColBERT/late interaction/cross-encoder

Không deploy cho corpus MVP nếu chưa có measured precision/recall gap và operational justification.

### GraphRAG

Route registry là deterministic reference model, không phải semantic knowledge graph. Không build GraphRAG trong v6.

### Autonomous tool calling

Answer model không tự gọi retrieval/search. Server-controlled stages giữ policy, budget và provenance.

### External traveler-memory framework

Không thêm Mem0, Zep hoặc LangMem trước measured failure của `chat_context`/Trip Project context.

### Automatic decay

Không suppress card theo age hoặc embedding similarity. Freshness policy, verification workflow và explicit evidence lifecycle vẫn là authority.

## Thứ tự triển khai tóm tắt

~~~text
0.  Evaluation-first baseline + source metadata isolation
1.  Shared query/facet/constraint contracts
2.  Minimal canonical route registry + OD authority
3.  Versioned geo/facet/search projections
4.  Scope-first relational allowlist
5.  Weighted field-aware PostgreSQL FTS
6.  Facet pools + marginal coverage selection
7.  Gap-aware web fallback + joint packing
8.  Prompt budget + bounded provenance scale
9.  Grey-band AI only if measured
10. Embeddings/hybrid/RRF only if measured
11. Topic briefs only if density requires
12. Traveler memory evaluation
13. Reconsider advanced retrieval only with evidence
~~~

## Definition of done cho roadmap

Roadmap được coi là thực thi thành công khi:

- Off-route example class bị chặn trước semantic retrieval.
- Query plan hỗ trợ multi-leg, typed constraints và one shared facet enum.
- Physical route segment không bị duplicate theo path.
- Registry partial không tạo hard negative sai.
- Search projection không chứa source/provenance lexical fields.
- PostgreSQL FTS baseline đạt candidate recall/final precision gates.
- Final evidence selection đáp ứng required requirement keys bằng deterministic marginal coverage.
- Missing/fresh facets được xử lý trước joint prompt packing.
- AI/vector/RRF không được đưa vào production nếu không có measured uplift.
- Every rendered card/web item có exact, current provenance; unrendered items không được đánh dấu used.
- Traveler memory tiếp tục tuân thủ correction, priority, privacy và deletion contracts hiện hữu.

## Tham chiếu

- V5 superseded: `docs/roadmaps/retrieval-va-tri-nho-traveler-v5.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- Architecture Spine: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- Community Knowledge Solution Design: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md`
- Current retrieval: `packages/database/src/knowledge-search.ts`
- Current source bundle: `packages/database/src/source-bundle.ts`
- PostgreSQL full-text search: https://www.postgresql.org/docs/current/textsearch-controls.html
- PostgreSQL text-search weighting: https://www.postgresql.org/docs/current/textsearch-features.html
- PostgreSQL `unaccent`: https://www.postgresql.org/docs/current/unaccent.html
- PostgreSQL `pg_trgm`: https://www.postgresql.org/docs/current/pgtrgm.html
- Reciprocal Rank Fusion: https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/
- ColBERTv2: https://arxiv.org/abs/2112.01488
