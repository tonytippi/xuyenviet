# Lộ trình cải tiến Retrieval & Trí nhớ Traveler - Phiên bản 6.1

## Trạng thái

Đề xuất ngày 2026-08-10, kế thừa và harden v6
(`docs/roadmaps/retrieval-va-tri-nho-traveler-v6.md`). Khi được approve, v6.1 thay thế v6
làm roadmap triển khai; v5 và v6 chỉ còn vai trò lịch sử.

V6 chưa được triển khai, nên v6.1 là minor revision của roadmap chứ không tạo song song
một runtime generation mới. Các proposed code symbols/read modes vẫn dùng suffix `V6`
và `v6_*`; stories phải implement contract trong v6.1, không contract cùng tên ở v6.

Đây là roadmap kỹ thuật chi tiết và architecture slice định hướng cho retrieval/traveler memory.
Đây chưa phải build plan đã được phê duyệt. Mỗi tranche triển khai vẫn phải cập nhật
PRD/architecture hiện hành, tạo epics/stories, kiểm tra implementation readiness và
sprint planning theo workflow BMad của dự án.

V6.1 giữ paradigm của v6 và đóng các lỗ hổng contract được phát hiện khi review:

- Geographic authority gắn với atomic fact/facet assertion; một place claim không thể
  hợp thức hóa route fact off-path trên cùng card.
- Mọi geographic decision được tính theo exact `(card, assertion, requirement, leg)`,
  không nén multi-leg thành một scalar relation.
- Web scope resolution trở thành immutable, replayable projection thay vì một status rời.
- Mỗi projection khai báo dependency manifest riêng; retrieval không dùng một global
  compatibility set thiếu hoặc dư dependency.
- Candidate cap chạy theo requirement-specific stable order và có telemetry cho candidate
  hợp lệ nhưng bị cap loại.
- Path authority, registry resolution state, requirement contribution, constraint identity,
  phrase normalization và legacy-backfill status được đặc tả machine-checkable.
- Evaluation gate tách zero-tolerance critical cohort khỏi statistical guardrail cohorts.

V6.1 vẫn giữ các thay đổi phương pháp lớn từ v6:

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

V6.1 phải làm cho retrieval trả lời được bốn câu hỏi theo đúng thứ tự:

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

15. **Claims cannot cross-authorize.** Một scope claim chỉ cấp applicability cho atomic
fact/facet assertion mà claim sở hữu; claim khác trên cùng card không được override hard
negative của assertion đang được xét.

16. **Applicability is requirement-local.** Geographic relation và semantic contribution
được quyết định theo requirement/leg; candidate-level summary không cấp authority.

17. **Caps preserve deterministic auditability.** Mọi bounded pool có pinned ordering,
cap stage, cap reason và stable tie-break; database row order không được ảnh hưởng recall.

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
  reasonCodes: string[];
  decidedAt: string;
};
~~~

- Knowledge aggregate evidence theo publication/policy contract hiện hành và phát một
  typed decision; Retrieval không tự chọn `any`/`all`/quorum bằng cách diễn giải lại raw
  evidence rows.
- Eligibility snapshot không cấp facet authority. Facet derivation/applicability chỉ do
  Retrieval-owned facet projection quyết định.
- `operator_required`, conflicted, pending hoặc otherwise ineligible luôn `exclude`.
- Eligibility được re-check ở final render bằng owner function, nhưng decision semantics
  vẫn do Knowledge định nghĩa.

### Query execution identity

~~~ts
type QueryExecutionContextV6 = {
  runId: string;
  retrievalReadMode: "legacy" | "v6_shadow" | "v6_active";
  evaluatedAt: string;
  normalizedQuestionHash: string;
  queryPlanHash: string;
  tripSnapshotId: string | null;
  tripSnapshotVersion: number | null;
  registrySnapshotId: string;
  odCoverageAssertions: Array<{
    assertionId: string;
    revision: number;
  }>;
  facetVocabularyVersion: string;
  parserVersion: string;
  pathAuthorityRuleVersion: string;
  routeResolutionRuleVersion: string;
  intentRequirementProfileVersion: string;
  constraintKeyVersion: string;
  exactPhraseNormalizationVersion: string;
  eligibilityRuleVersion: string;
  rankingConfigVersion: string;
  selectorConfigVersion: string;
  runtimePolicyVersion: string;
};

type ProjectionDependencyManifestV6 =
  | {
      projectionKind: "geography";
      contentVersion: number;
      registrySnapshotId: string;
      geoProjectionSchemaVersion: string;
      scopeParserVersion: string;
      factUnitSchemaVersion: string;
    }
  | {
      projectionKind: "facet";
      contentVersion: number;
      geoProjectionGeneration: string;
      facetVocabularyVersion: string;
      facetProjectionSchemaVersion: string;
      factUnitSchemaVersion: string;
    }
  | {
      projectionKind: "search";
      contentVersion: number;
      geoProjectionGeneration: string;
      facetProjectionGeneration: string;
      searchProjectionSchemaVersion: string;
      exactPhraseNormalizationVersion: string;
      textSearchConfigVersion: string;
    }
  | {
      projectionKind: "embedding";
      searchProjectionGeneration: string;
      searchUnitId: string;
      textHash: string;
      modelCatalogVersion: string;
      modelId: string;
      modelVersion: string;
      dimensions: number;
      distanceMetric: "cosine" | "inner_product";
    };

type RetrievalRuntimePolicyV6 = {
  version: string;
  maximumRequirementKeysPerQuery: number;
  maximumLexicalCandidatesPerRequirementKey: number;
  maximumUnionCandidatesBeforeGreyBand: number;
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
- Mỗi derived projection phải exact-match dependency manifest của chính nó. Retrieval
  validate active owner version và mọi transitive generation reference; không yêu cầu
  projection mang dependency không tham gia derivation.
- Search projection chỉ current khi exact geo/facet generation mà nó tham chiếu current.
  Embedding chỉ current khi exact search generation/text hash/model contract current.
- Compatibility khác exact match chỉ được phép qua explicit, reviewed migration map;
  không suy ra vì version string trông gần nhau.
- Persist bounded sanitized query plan payload hoặc content-addressed hash kèm immutable
  owner snapshot reference đủ để replay.
- User-derived execution state phải có retention/deletion propagation theo chat/Trip
  ownership contract; deletion không để lại payload có thể tái dựng user question/context.
- Candidate caps, ordering config, batch sizes, timeouts, web bounds và diagnostic
  retention luôn đến từ pinned runtime policy; không hard-code khác nhau trong
  independently-built stages.

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

type ConstraintRefBaseV6 = {
  constraintKey: string;
  keyVersion: string;
  kind:
    | "traveler_count"
    | "child_need"
    | "vehicle"
    | "ev_charging"
    | "driving_tolerance"
    | "budget"
    | "preference"
    | "avoid_item";
  canonicalValueHash: string;
};

type ConstraintRefV6 = ConstraintRefBaseV6 &
  (
    | {
        source: "trip_constraints_row";
        ownerReference: {
          tripProjectId: string;
          version: number;
          fieldKey: string;
        };
      }
    | { source: "current_turn_explicit" }
    | { source: "query_parser_derived" }
  );
~~~

- Contract reuse losslessly các field hiện có của `TravelerWorkspaceProjection.constraints`
  và `trip_project_constraints`. Retrieval không tạo parallel vehicle/budget/child vocabulary.
- Dates, route style và transient query preferences nằm trong query plan/Trip snapshot,
  không được ghi ngược vào Trip constraints chỉ vì retrieval parse được chúng.
- Nếu schema Trips thay đổi, adapter phải versioned, lossless và có per-field tests.
- Server chỉ nhận allowlisted keys và bounded scalar/string-array/object values.
- Unknown keys bị reject hoặc bỏ với telemetry; không truyền nguyên `Record<string, unknown>` vào model/search.
- Sensitive data ngoài traveler-memory contract hiện hữu không được thêm vào constraint.
- Current persisted Trip constraints pin exact `(tripProjectId, version, fieldKey)` của
  aggregate row. Canonical constraint key dùng `constraintKeyVersion`, kind + normalized
  allowlisted value + source scope; không dùng array ordinal, raw label hoặc model output
  order làm identity. Nếu future schema có item identity, upstream architecture/contract
  update phải đổi owner-reference variant trước khi Retrieval sử dụng.
- Query-only constraint key chỉ ổn định trong exact query execution/trip snapshot và bị
  xóa cùng owner state. Hai constraint có cùng display label nhưng khác normalized value
  không được collapse.

### TravelQueryPlan v6

~~~ts
type TravelIntent =
  | "itinerary"
  | "route_advice"
  | "place_advice"
  | "comparison"
  | "verification";

type PathCandidateV6 = {
  pathId: string;
  derivation:
    | "explicit_current_turn"
    | "confirmed_trip_path"
    | "complete_od_assertion"
    | "deterministic_style_match"
    | "inferred_free_text";
};

type HardScopeAuthorizationV6 =
  | {
      kind: "selected_path";
      pathId: string;
      authority: "explicit_current_turn" | "confirmed_trip_path";
      authorityReferenceId: string;
    }
  | {
      kind: "complete_od_alternatives";
      pathIds: string[];
      odCoverageAssertion: {
        assertionId: string;
        revision: number;
        registrySnapshotId: string;
      };
    }
  | {
      kind: "none";
      reason:
        | "no_path"
        | "known_partial"
        | "ambiguous_paths"
        | "soft_inference_only";
    };

type QueryLeg = {
  legId: string;
  originId: string;
  destinationId: string;
  direction: "forward" | "reverse";
  pathCandidates: PathCandidateV6[];
  hardScopeAuthorization: HardScopeAuthorizationV6;
};

type TravelQueryPlanV6 = {
  version: "travel_query_plan_v6";
  intents: TravelIntent[];
  legs: QueryLeg[];
  requestedFacets: RequestedFacet[];
  constraints: TypedTravelConstraints;
  constraintRefs: ConstraintRefV6[];
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
- Nếu route chưa resolve đủ authority, `hardScopeAuthorization.kind = "none"`; không
  hard-exclude bằng một path tình cờ là path duy nhất registry biết.

### Path authority matrix

| Input/resolution | Candidate use | Hard authorization |
|---|---|---|
| Traveler chọn explicit canonical path trong current turn | Exact selected path | Có, nếu entity/path resolution exact hoặc reviewed và choice được pin trong query snapshot |
| Confirmed Trip-owned canonical path | Exact selected path | Có, nếu Trip snapshot/aggregate version và registry snapshot current |
| Active complete OD assertion | Toàn bộ eligible alternatives | Có trên set alternatives; không tự chọn một path đại diện |
| Deterministic route-style match nhưng traveler chưa chọn | `known_path_soft` | Không |
| Free-text inferred preference | Soft ranking/clarification | Không |
| Nhiều path material và chưa xác nhận | Bounded union soft | Không; hỏi làm rõ khi kết quả phụ thuộc path |

`selected_path` authorization không được tạo chỉ vì registry trả đúng một known path.
Explicit current-turn choice phải được giữ dưới dạng bounded sanitized authority reference,
không chỉ boolean hoặc `selectedPathId` không provenance.

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
  assertionId: string;
  revision: number;
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
- Assertion revision là immutable; sửa coverage/path set tạo assertion revision mới.
- Chỉ active assertion trong effective window tại exact `QueryExecutionContextV6.evaluatedAt`
  và exact registry snapshot mới cấp `complete_od_alternatives` authority. Resolved leg pin
  exact `assertionId/revision`, không chỉ pin registry snapshot.

### Resolved route

~~~ts
type RouteResolutionStateV6 =
  | "authoritative_selected"
  | "authoritative_complete"
  | "known_partial"
  | "ambiguous_paths"
  | "no_path";

type ResolvedQueryLeg = {
  legId: string;
  originId: string;
  destinationId: string;
  direction: "forward" | "reverse";
  pathIds: string[];
  segmentIdsByPath: Record<string, string[]>;
  locationIdsByPath: Record<string, string[]>;
  resolutionState: RouteResolutionStateV6;
  hardScopeAuthorization: HardScopeAuthorizationV6;
  odCoverageAssertion?: {
    assertionId: string;
    revision: number;
  };
  registrySnapshotId: string;
};
~~~

Resolution behavior:

- `authoritative_selected`: classify hard positive/negative trên exact authorized path.
- `authoritative_complete`: classify hard positive/negative trên toàn bộ assertion path set.
- `known_partial`: known matching paths chỉ tạo soft positive; absence không tạo hard negative.
- `ambiguous_paths`: dùng bounded union soft và tạo ambiguity/clarification khi path làm
  thay đổi answer; không chọn path phổ biến nhất.
- `no_path`: route-specific path evidence disabled; chỉ exact place assertion phù hợp và
  explicit nationwide/general evidence còn eligible.

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
    }
  | {
      kind: "nationwide";
    }
  | {
      kind: "unresolved";
      sourceField: "locationName" | "routeSegment";
    };

type CardFactUnitV6 = {
  factUnitId: string;
  role: "card_atomic_fact";
  sourceField: "knowledge_card_fact";
  sourceValueHash: string;
};

type CardScopeAssertionV6 = {
  assertionId: string;
  factUnitId: string;
  claim: CardScopeClaimV6;
  resolutionStatus: ScopeResolutionStatus;
  resolutionMethod: ScopeResolutionMethod;
  matchedInputs: Array<{
    field: "locationName" | "routeSegment" | "type";
    normalizedValueHash: string;
  }>;
};

type CardGeographicProjectionV6 = {
  cardId: string;
  contentVersion: number;
  registrySnapshotId: string;
  projectionVersion: "card_geo_v6";
  projectionGeneration: string;
  dependencyManifest: Extract<
    ProjectionDependencyManifestV6,
    { projectionKind: "geography" }
  >;
  factUnits: CardFactUnitV6[];
  scopeAssertions: CardScopeAssertionV6[];
  status: "active" | "stale" | "disabled";
};
~~~

Rules:

- Projection derive từ card-owned geography fields và versioned registry, không từ source label/evidence metadata.
- `CardFactUnitV6` không phải aggregate/claim mới. Knowledge card vẫn là atomic planning
  fact duy nhất theo PRD/AD-7; Retrieval chỉ tạo đúng một projection-local fact reference
  cho mỗi `(cardId, contentVersion)`, không có lifecycle/writer API riêng.
- Fact reference derive deterministic từ card ID + content version + canonical fact hash
  và pin `factUnitSchemaVersion`. Content update tạo projection generation/reference mới;
  old reference chỉ tồn tại qua immutable historical manifests theo retention contract.
- Summary chỉ giải thích atomic card fact. Practical details là supporting render/search
  fields, không tự trở thành independent premise/fact unit. Nếu một detail cần geographic
  scope hoặc requirement contribution độc lập, Knowledge phải tách nó thành card atomic
  riêng qua owner workflow.
- Không dùng LLM để sentence-split card thành authority-bearing facts. Card chứa nhiều
  geographic facts không thể biểu diễn như một atomic fact phải giữ scope ambiguous hoặc
  được sửa/split trong Knowledge workflow; Retrieval không tạo claim aggregate thứ hai.
- Chỉ `exact` hoặc `reviewed` assertion được dùng cho hard geographic decision.
- `assertionId` derive từ projection generation + fact unit + canonical claim identity;
  operator review/re-resolution tạo assertion/projection generation mới, không mutate row
  đã được retrieval manifest pin.
- `ambiguous`/`unknown` place hoặc route assertion dùng `unresolved` claim và không được
  dùng làm route evidence.
- `nationwide` phải là explicit deterministic/reviewed claim; không suy ra từ failure resolve geography.
- LLM có thể đề xuất mapping cho operator/reference-data workflow nhưng không được tự ghi `exact`/`reviewed`.
- Status/method matrix bắt buộc:
  - `canonical_id` -> `exact` khi foreign-key/registry validation pass;
  - unique `exact_alias` -> `exact` trong pinned registry snapshot;
  - `deterministic_route_parse` -> `exact` chỉ khi toàn bộ endpoints/path interval được
    canonicalize duy nhất và validator pass, ngược lại `ambiguous/unknown`;
  - `operator_review` -> `reviewed` với reviewer artifact/version;
  - `legacy_backfill` -> chỉ `ambiguous/unknown`, không bao giờ `exact/reviewed`. Sau
    operator review phải phát assertion mới với method `operator_review`.
- Stale projection bị loại khỏi hard route evidence cho đến khi rebuild.
- Geography projection update không tự thay đổi canonical card content; projection vẫn là derived state.
- Một `path_interval` luôn pin một path và contiguous half-open edge interval. Projection
  validation reject disconnected segments, mixed paths hoặc interval rỗng.
- Physical segment thuộc nhiều paths tạo nhiều independent `path_interval` claims; không
  union segment IDs rồi suy ra một interval giả.
- Mỗi scope assertion bắt buộc thuộc một `factUnitId`. Metadata locality hoặc assertion
  của supporting fact không cấp scope cho primary route/driving fact.
- Một fact unit có nhiều assertion được xét riêng theo requirement; positive place claim
  không override hard-negative path interval của cùng/different fact unit.
- `corridor_general` chỉ làm general/corridor-wide supporting evidence khi facet
  projection link explicit assertion đó. Nó không làm segment premise và không cấp local
  place applicability.
- Persistent representation dùng normalized claim/link rows với composite foreign keys
  tới registry snapshot/entities và indexes theo card/path/location/corridor. DTO có thể
  aggregate arrays/claims khi đọc; JSON/array không thay relational integrity.

## Facet projection

~~~ts
type ScopeExpressionV6 = {
  // OR across alternatives; AND inside one alternative.
  anyOf: Array<{
    alternativeId: string;
    allOfAssertionIds: string[];
  }>;
};

type CardFacetProjectionV6 = {
  cardId: string;
  contentVersion: number;
  geoProjectionGeneration: string;
  facetVocabularyVersion: string;
  projectionGeneration: string;
  projectionVersion: "card_facet_v6";
  dependencyManifest: Extract<
    ProjectionDependencyManifestV6,
    { projectionKind: "facet" }
  >;
  facets: Array<{
    facetAssertionId: string;
    factUnitId: string;
    facet: TravelFacet;
    applicability: "primary" | "supporting";
    scopeExpression: ScopeExpressionV6;
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
- `supporting` facet signal chỉ boost/annotate primary atomic fact; nó không một mình
  satisfy `minimumEvidence = 1`. Independent premise phải là primary facet trên một
  atomic Knowledge card.
- Free-form tag không tự tạo facet authority; tag phải map qua reviewed taxonomy.
- Mọi assertion trong `scopeExpression` phải tồn tại trong exact geo projection generation
  và thuộc cùng `factUnitId`. Một facet assertion không được link place claim của fact
  unit khác.
- Expression evaluator là cố định: một `allOf` group pass khi mọi assertion decision trong
  group eligible; `anyOf` pass khi ít nhất một group pass. Hard-negative chỉ làm fail group
  chứa assertion đó, không veto independent alternative. Empty group/expression bị reject.
- Path memberships tương đương trên alternative paths thường là separate one-assertion
  OR groups. Hai assertions chỉ đặt cùng AND group khi atomic fact thực sự cần cả hai
  scopes đồng thời và fixture chứng minh semantics.
- Expression canonicalization sort/deduplicate assertion IDs trong group, reject duplicate
  alternatives và derive `alternativeId/expressionHash` bằng versioned serialization;
  source array order không thay đổi identity.
- `route`/`driving_segment` premise phải link `path_interval`; `place` chỉ cấp local
  applicability cho local facet; `corridor_general`/`nationwide` chỉ cấp facet đã được
  explicit link và không thay thế route premise.
- `operator_required`/`caveat_only` code state không eligible cho internal retrieval;
  nó tạo gap/web-verification signal theo authoritative PRD/architecture.

## Search projection

~~~ts
type KnowledgeSearchProjectionV6 = {
  cardId: string;
  contentVersion: number;
  geoProjectionGeneration: string;
  facetProjectionGeneration: string;
  searchProjectionVersion: "knowledge_search_v6";
  projectionGeneration: string;
  dependencyManifest: Extract<
    ProjectionDependencyManifestV6,
    { projectionKind: "search" }
  >;
  searchUnits: Array<{
    searchUnitId: string;
    factUnitId: string;
    facetAssertionId: string;
    scopeExpression: ScopeExpressionV6;
    facet: TravelFacet;
    applicability: "primary" | "supporting";
    titleText: string;
    geographyText: string;
    facetText: string;
    bodyText: string;
    normalizedExactPhrases: string[];
    searchVector: unknown; // PostgreSQL tsvector in persistence
    textHash: string;
  }>;
  status: "active" | "stale" | "disabled";
};
~~~

Mỗi search unit thuộc exact facet assertion và scope-assertion links; ranking chạy trên
candidate-to-requirement edge qua unit này, không dùng một global card rank để boost mọi
facet/scope edge. Searchable fields trong mỗi unit:

- `titleText`: title/fact.
- `geographyText`: canonical location/segment names và reviewed aliases resolved cho card.
- `facetText`: canonical card type/facet names và reviewed tags.
- `bodyText`: summary và chỉ allowlisted practical details mapped tới cùng facet assertion.

Forbidden lexical fields:

- Source label, kind, publisher, URL hoặc canonical URL.
- Capture metadata hoặc provider metadata.
- Evidence quote.
- Verification status, official/partner flags hoặc support level.
- Raw source/transcript.
- Operator notes, judge reasoning hoặc audit text.
- Card freshness/update timestamp rendered như searchable words.

Source/freshness metadata vẫn được dùng cho eligibility, caveat, audit, source diversity và tie-break khi relevance tương đương; nó không tạo text match.

Mỗi `searchVector` row được indexing worker materialize atomically và GIN index trực tiếp
trên stored `tsvector` column. Không dùng `unaccent()` trong generated-column/expression-index
DDL nếu deployment target không chứng minh immutability requirements. Query construction
dùng cùng normalization/config và safe constructors như `plainto_tsquery` hoặc
`phraseto_tsquery`; không nối raw traveler text vào `to_tsquery`.

`normalizedExactPhrases` chỉ được tạo từ:

- canonical location/path/segment names và reviewed aliases thuộc exact geo projection;
- versioned facet/card-type labels thuộc exact facet projection;
- reviewed multi-token domain phrases trong phrase vocabulary;
- bounded card-owned title/fact phrase đã qua deterministic phrase extractor.

Normalization pin `exactPhraseNormalizationVersion`: Unicode NFC, whitespace collapse,
case fold, punctuation/hyphen/arrow canonicalization và accent-preserving form. Unaccented
form là comparison channel riêng, không ghi đè canonical phrase. Raw traveler query,
source/provider metadata, evidence quote và arbitrary free-form tag không được thêm vào
phrase projection. Mỗi phrase có maximum token/character bound và stable source kind;
query match phải dùng cùng version/config.

Exact entity/phrase/facet signals chỉ được phát cho assertion links của search unit hiện
tại. Một place phrase từ supporting detail không boost route requirement edge nếu detail
không nằm trong exact linked facet/scope assertions.

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

Task defaults không được implement bằng ad-hoc list trong parser. Bước 0 phát hành:

~~~ts
type RequirementExpansionRuleV6 =
  | {
      ruleId: string;
      kind: "per_leg";
      facets: TravelFacet[];
      importance: "required" | "useful" | "optional";
      legSelector: "all_resolved_legs";
    }
  | {
      ruleId: string;
      kind: "per_location";
      facets: TravelFacet[];
      importance: "required" | "useful" | "optional";
      locationSource:
        | "explicit_query_places"
        | "origins"
        | "destinations"
        | "planned_stops";
    }
  | {
      ruleId: string;
      kind: "global";
      facets: TravelFacet[];
      importance: "required" | "useful" | "optional";
    }
  | {
      ruleId: string;
      kind: "comparison_target";
      facets: TravelFacet[];
      importance: "required" | "useful";
      targetSource: "compared_legs_or_locations";
    }
  | {
      ruleId: string;
      kind: "constraint";
      constraintKinds: ConstraintRefV6["kind"][];
      facets: TravelFacet[];
      importance: "required" | "useful";
      targetMode: "global" | "each_leg" | "explicit_location";
    };

type IntentRequirementProfileV6 = {
  version: string;
  rules: RequirementExpansionRuleV6[];
  intents: Array<{
    intent: TravelIntent;
    minimumEligibleFacets: TravelFacet[];
    defaultImportance: Partial<
      Record<TravelFacet, "required" | "useful" | "optional">
    >;
    requirementExpansionRuleIds: string[]; // FK to rules in this immutable profile
  }>;
};
~~~

Minimum seed behavior:

| Intent | Minimum facet behavior |
|---|---|
| `itinerary` | `route`, `stop`, `warning` phải có requirement keys tối thiểu; accommodation/food/activity được thêm theo trip shape hoặc explicit query |
| `route_advice` | route/driving requirement cho từng leg; warning là useful tối thiểu |
| `place_advice` | ít nhất một local requirement tại exact place; facet cụ thể từ query được nâng required |
| `comparison` | cùng compared facet được tạo cho mỗi entity/leg cần so sánh; không cho entity A satisfy entity B |
| `verification` | exact requested facet/location/leg requirement và freshness requirement khi fact time-sensitive |

`general` chỉ là low-priority supporting requirement khi không có structured facet phù
hợp; nó không satisfy hoặc che missing route/place/warning/constraint requirement. Mọi
profile change pin version, có fixtures và được đo required/useful coverage riêng.

Profile validator reject unknown/duplicate rule IDs, empty facet lists và intent/rule
combinations không có target source. Golden expansion vectors map exact QueryPlan fixtures
tới canonical sorted requirement keys cho: repeated OD legs, multiple stops, warning per
leg, accommodation at destination, comparisons và global/leg/location constraints.
Repeated OD endpoints vẫn tạo distinct keys vì `legId` khác.

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
  | "queried_place_local"
  | "nationwide_applicable"
  | "corridor_general_soft"
  | "known_path_soft"
  | "off_route_before_origin"
  | "off_route_after_destination"
  | "off_selected_path"
  | "off_every_authoritative_path"
  | "scope_ambiguous"
  | "scope_unknown";

type CandidateScopeDecisionV6 = {
  scopeDecisionId: string;
  cardId: string;
  factUnitId: string;
  scopeAssertionId: string;
  requirementKeyId: string;
  legId?: string;
  relation: GeographicRelationV6;
  authority: "hard" | "soft" | "none";
  eligible: boolean;
  reasonCode: RetrievalReasonCodeV6;
};

type ScopeExpressionDecisionV6 = {
  scopeExpressionDecisionId: string;
  cardId: string;
  factUnitId: string;
  facetAssertionId: string;
  requirementKeyId: string;
  legId?: string;
  scopeExpressionHash: string;
  alternativeDecisions: Array<{
    alternativeId: string;
    assertionDecisionIds: string[];
    passed: boolean;
  }>;
  satisfiedAlternativeIds: string[];
  pathCoverage?: {
    evaluatedPathIds: string[];
    matchedPathIds: string[];
    excludedPathIds: string[];
    unresolvedPathIds: string[];
    condition:
      | "selected_path"
      | "all_authoritative_paths"
      | "some_authoritative_paths"
      | "known_partial_soft";
  };
  eligible: boolean;
  reasonCodes: RetrievalReasonCodeV6[];
};
~~~

Đây là geographic unit of decision. Candidate-level relation nếu materialize chỉ là
derived display/telemetry summary và không được dùng làm hard filter, selection hoặc
replay authority.

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
- Place assertion:
  - origin/destination/planned stop hoặc explicit resolved place requirement membership only;
  - sharing corridor alone không tạo local applicability.
- Nationwide assertion:
  - allow only when facet/intent matches;
  - lower priority than scoped evidence.
- Corridor-general claim:
  - `corridor_general_soft` only for supporting facet explicitly linked to assertion by
    current facet projection;
  - never satisfies route/driving-segment premise by itself;
  - never creates place-local applicability;
  - absence/presence không cấp hard route decision.
- Ambiguous/unknown route/place card:
  - exclude from route-specific evidence;
  - không tự đổi thành generic advice.

Assertion aggregation rules:

1. Candidate-to-requirement edge chỉ được tạo từ exact facet row và
   `scopeExpression` của cùng `factUnitId`.
2. Classifier phát decision riêng cho mỗi `(assertion, requirement, leg)`; decision của
   leg 1 không được reuse cho leg 2.
3. Positive place assertion không override off-path interval vì route/driving facet
   không được link place assertion. Supporting metadata locality không tạo edge cho
   primary fact.
4. Một requirement contribution chỉ eligible nếu full scope expression pass theo
   authority của exact leg; không dùng global “any positive wins” hoặc “any negative veto”.
5. Nếu selected render variant chứa thêm fact unit có hard-ineligible geographic fact mà
   không thể omit nguyên unit, cả render variant bị loại. Whole-card rendering không được
   làm lộ fact off-scope chỉ vì một atomic fact khác eligible.

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

### Deterministic candidate bounds

Policy/scope eligibility là logical SQL predicate, không phải một array bị cắt theo row
order. Candidate cap đầu tiên chỉ xảy ra sau khi exact scope/facet edges và lexical
features đã được tính trong cùng requirement-specific query.

Per `requirementKeyId`, SQL dùng stable ordering:

1. hard-authoritative positive trước soft-positive;
2. exact requirement geography/entity trước broader nationwide/corridor scope;
3. primary facet assertion trước supporting assertion;
4. exact canonical entity/phrase signal;
5. descending normalized lexical score;
6. lower bounded render token cost;
7. stable `(cardId, searchUnitId, requirementKeyId, legId)`.

Sau đó:

1. `LIMIT maximumLexicalCandidatesPerRequirementKey` trên từng requirement partition;
2. union candidate IDs, giữ các candidate-to-requirement edges đã survive cap;
3. deduplicate whole-card work;
4. nếu union vượt `maximumUnionCandidatesBeforeGreyBand`, stable global order dùng
   required-before-useful-before-optional, best per-edge rank rồi stable card ID;
5. chỉ phần còn lại mới vào semantic band/AI.

Một card lọt union qua requirement A không tự khôi phục contribution edge đã bị cap ở
requirement B. Mọi excluded edge ghi `eligible_but_cap_excluded`, stage/cap version và
pre-cap rank; production mặc định chỉ persist bounded top exclusions + aggregate counts.
Telemetry bắt buộc có eligible count trước cap, kept count sau cap, cap-excluded count và
must-include cap exclusion rate theo requirement/cohort. Runtime policy không được đặt cap
thấp hơn value đã pass pinned gate profile.

### Deterministic ordering cho mọi bounded stage

Mọi cap dùng pinned runtime policy, stable pre-cap rank và typed exclusion reason:

| Stage | Stable ordering trước cap | Exclusion reason |
|---|---|---|
| Requirement expansion | required > useful > optional; explicit query > trip constraint > intent default; canonical requirement ID | `requirement_cap_excluded` |
| Grey-band admission | requirement importance, hard scope before soft, distance to nearest deterministic threshold, best lexical rank, stable edge ID | `grey_band_cap_excluded` |
| AI batching | exact grey-band admission order, chunk tuần tự theo `maximumAiBatchSize`; không reshuffle theo card fetch order | `ai_batch_cap_excluded` |
| Web query gaps | required verification > required missing > useful fresh > useful missing > optional; canonical requirement ID | `web_query_cap_excluded` |
| Web results per requirement | eligible canonical scope before unresolved lead, deterministic quality/term coverage, captured provider rank, payload hash | `web_result_cap_excluded` |
| Final rendered items | required coverage, useful coverage, selected marginal rank, stable item ID | `render_item_cap_excluded` |

Nếu required requirement count vượt `maximumRequirementKeysPerQuery`, system không silently
drop required keys: giữ deterministic prefix chỉ cho diagnostic, trả clarification/scope-
narrowing hoặc explicit bounded-limit gap trước search. Các stage persist aggregate counts
và bounded top excluded rows với pre-cap rank; identical input/snapshots/policy tạo cùng
kept set và batch boundaries.

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

Feature vector identity là
`(cardId, searchUnitId, requirementKeyId, legId, rankingConfigVersion)`. Không reuse vector
của facet/leg khác dù cùng card ID.

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
  searchProjectionGeneration: string;
  searchUnitId: string;
  facetAssertionId: string;
  scopeExpressionHash: string;
  textHash: string;
  modelCatalogVersion: string;
  embeddingModelId: string;
  embeddingModelVersion: string;
  dimension: number;
  distanceMetric: "cosine" | "inner_product";
  dependencyManifest: Extract<
    ProjectionDependencyManifestV6,
    { projectionKind: "embedding" }
  >;
  vector: number[];
  status: "active" | "disabled";
};
~~~

- Embedding input chỉ gồm safe semantic text của exact search unit. Không embed một global
  card document rồi reuse score cho mọi facet/scope requirement edge.
- Vector identity gắn với
  `searchUnitId + textHash + embeddingModelVersion + dimensions + distanceMetric`.
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
type EvidenceRequirementTargetV6 =
  | { kind: "global" }
  | { kind: "leg"; legId: string }
  | { kind: "location"; locationId: string }
  | { kind: "leg_location"; legId: string; locationId: string }
  | { kind: "constraint_global"; constraintKey: string }
  | { kind: "constraint_leg"; constraintKey: string; legId: string }
  | {
      kind: "constraint_location";
      constraintKey: string;
      locationId: string;
    };

type EvidenceRequirementKeyV6 = {
  id: string;
  facet: TravelFacet;
  target: EvidenceRequirementTargetV6;
  freshnessClass: "static" | "fresh";
};

type CardSemanticDecisionV6 = {
  cardId: string;
  requirementAssessments: Array<{
    factUnitId: string;
    facetAssertionId: string;
    searchUnitId: string;
    scopeExpressionDecisionId: string;
    requirementKeyId: string;
    applicable: boolean;
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

Requirement `id` được derive bằng versioned canonical serialization của
`facet + discriminated target + freshnessClass`; không có optional-field bag. Duplicate
canonical keys được collapse trước retrieval, nhưng importance chỉ được nâng theo
deterministic precedence `required > useful > optional`.

Expansion rules bắt buộc:

- route/driving requirements của itinerary/route advice expand một key cho mỗi leg;
- local place requirements expand theo exact location hoặc leg-location target;
- constraint requirement dùng đúng global/leg/location variant do versioned constraint
  expansion rule khai báo;
- global key không được satisfy leg/location-specific key và leg A không satisfy leg B.

AI không trả:

- geographic relation;
- policy;
- `requiresCaveat`;
- route/path ID mới;
- source selection;
- persistence instruction.

Server validation:

- exactly one assessment per server-supplied candidate-to-requirement edge;
- no unknown/duplicate card, fact unit, facet/search unit, scope-expression decision hoặc
  requirement edge;
- assessment chỉ được reference server-supplied eligible edge;
- AI không tạo facet/requirement key mới hoặc làm một leg satisfy leg khác;
- decision không thay đổi deterministic caveat/policy/geography;
- invalid batch fail closed;
- deterministic high-confidence candidates vẫn dùng được nếu AI grey-band batch fail;
- grey-band edges fail về not-selected, không fail-open.

AI adjudication chỉ productionize khi primary metric uplift và mọi guardrail đạt exact
experiment gate cho `grey_band_ai` trong pinned `RetrievalGateProfileV6`.

## Facet-aware evidence selection

### Evidence requirements

Query plan chuyển thành:

~~~ts
type EvidenceRequirement = {
  key: EvidenceRequirementKeyV6;
  importance: "required" | "useful" | "optional";
  derivation:
    | RequestedFacet["reason"]
    | "intent_profile"
    | "clarification_followup";
  expansionRuleId: string;
  minimumEvidence: 0 | 1;
  freshnessRequired: boolean;
};

type CandidateRequirementContributionV6 = {
  contributionId: string;
  cardId: string;
  factUnitId: string;
  facetAssertionId: string;
  searchUnitId: string;
  scopeExpressionDecisionId: string;
  scopeExpressionHash: string;
  satisfiedAlternativeIds: string[];
  scopeAssertionDecisionIds: string[];
  requirementKeyId: string;
  legId?: string;
  geographicRelation: GeographicRelationV6;
  geographicAuthority: "hard" | "soft";
  pathCoverageCondition:
    | "unconditional"
    | "selected_path"
    | "all_authoritative_paths"
    | "path_dependent"
    | "known_partial_soft";
  semanticBand: CandidateSemanticBand;
  candidateOrigin:
    | "deterministic_exact"
    | "fts"
    | "vector"
    | "hybrid"
    | "grey_band_ai";
  relevance: "essential" | "useful" | "optional";
  freshness: "current_static" | "current_fresh" | "verification_required";
  reasonCodes: RetrievalReasonCodeV6[];
};

type EvidenceRequirementOutcomeV6 = {
  requirementKeyId: string;
  status:
    | "satisfied"
    | "missing"
    | "requires_verification"
    | "requires_clarification";
  selectedContributionIds: string[];
  gapReason?: EvidenceGap["reason"];
};

type SelectionManifestV6 = {
  manifestId: string;
  runId: string;
  selectorConfigVersion: string;
  internalContributions: CandidateRequirementContributionV6[];
  webContributions: WebRequirementContributionV6[];
  requirementOutcomes: EvidenceRequirementOutcomeV6[];
  selectedItemsInOrder: Array<
    | {
        itemKind: "knowledge_card";
        cardId: string;
        renderVariantId: string;
        renderTextHash: string;
        tokenCount: number;
        contributionIds: string[];
      }
    | {
        itemKind: "web_evidence";
        webEvidenceItemId: string;
        renderVariantId: string;
        renderTextHash: string;
        tokenCount: number;
        contributionIds: string[];
      }
  >;
};
~~~

`minimumEvidence` không phải type quota. Nó biểu diễn liệu answer có cần ít nhất một premise
hợp lệ cho exact facet/leg/location/constraint requirement. Card route cho leg 1 không
được mark route requirement của leg 2 là satisfied.

`EvidenceRequirement` tồn tại trước candidate generation và không chứa result. Contribution
chỉ được tạo sau scope decision + deterministic/AI semantic adjudication; selector chỉ
consume typed contributions. Manifest pin exact scope relation, semantic band, candidate
origin, relevance, freshness và reason codes đã dùng, nên replay không phải suy ngược từ
selected card IDs.

Contribution có `pathCoverageCondition = path_dependent` không satisfy unconditional
route/driving requirement. Outcome là `requires_clarification` và gap reason
`path_choice_required` cho đến khi traveler chọn path hoặc answer requirement được
explicitly modeled như conditional comparison. Matched/excluded path IDs luôn nằm trong
ScopeExpressionDecision; scalar `on_some_plausible_paths` không đủ làm coverage proof.

### Marginal coverage objective

Final selector chạy deterministic greedy constrained selection:

~~~text
marginalGain(itemVariant | selected) =
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
- exact selected render-variant cost;
- total source budget;
- bounded source-handle capacity;
- current version/projection;
- one card counted once even if it covers multiple facets.

Selection loop:

1. Chọn exact item variant có positive marginal gain cao nhất.
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
    | "path_choice_required"
    | "budget_excluded";
  mayUseWeb: boolean;
  requiresClarification: boolean;
};

type WebEvidenceItemV6 = {
  webEvidenceItemId: string;
  captureId: string;
  resultPayloadHash: string;
  provider: string;
  capturedAt: string;
  requirementKeyId: string;
  scopeProjectionId: string;
  webFacts: Array<{
    webFactId: string;
    webFactTextHash: string;
    factExtractionVersion: string;
    candidateFacets: TravelFacet[];
  }>;
};

type WebEvidenceScopeProjectionV6 = {
  scopeProjectionId: string;
  captureId: string;
  resultPayloadHash: string;
  registrySnapshotId: string;
  resolverVersion: string;
  projectedAt: string;
  scopeAssertions: Array<{
    webScopeAssertionId: string;
    webFactId: string;
    claim: CardScopeClaimV6;
    resolutionMethod:
      | "canonical_entity_match"
      | "deterministic_scope_parse"
      | "operator_review";
    resolutionStatus: ScopeResolutionStatus;
    matchedPayloadFieldHashes: string[];
  }>;
  reasonCodes: Array<
    | "scope_resolved"
    | "explicit_nationwide_general"
    | "scope_unresolved"
    | "scope_mismatch"
  >;
};

type WebEvidenceScopeDecisionV6 = {
  scopeDecisionId: string;
  scopeProjectionId: string;
  webScopeAssertionId: string;
  requirementKeyId: string;
  legId?: string;
  relation: GeographicRelationV6;
  eligibleAsPremise: boolean;
  decisionHash: string;
  reasonCode:
    | "authoritative_scope_match"
    | "explicit_nationwide_general"
    | "scope_unresolved"
    | "scope_mismatch";
};

type WebRequirementContributionV6 = {
  contributionId: string;
  webEvidenceItemId: string;
  captureId: string;
  resultPayloadHash: string;
  webFactId: string;
  webFactTextHash: string;
  factExtractionVersion: string;
  scopeProjectionId: string;
  webScopeAssertionId: string;
  scopeDecisionId: string;
  requirementKeyId: string;
  facet: TravelFacet;
  semanticApplicability: "applicable";
  semanticDecisionMethod: "deterministic" | "bounded_validated_ai";
  relevance: "essential" | "useful" | "optional";
  freshness: "captured_current" | "verification_required";
  verificationState: "external_unverified";
  reasonCodes: RetrievalReasonCodeV6[];
};
~~~

Rules:

- Web fallback query được build per missing/fresh facet với resolved canonical names/path style; không chỉ gửi nguyên broad question.
- Web result luôn external/unverified cho đến khi ingested qua Knowledge.
- Scope projection là immutable và unique theo exact
  `(captureId, resultPayloadHash, registrySnapshotId, resolverVersion)`. Payload hash,
  registry hoặc resolver đổi tạo projection mới; không mutate projection lịch sử.
- Projection lưu independent canonical scope assertions và resolution provenance;
  query-specific decision được tính riêng theo exact `(assertion, requirement, leg)` và
  pin vào Selection/Prompt Render Manifest. Positive assertion không override mismatch
  assertion linked tới premise đang được xét.
- Mỗi web scope assertion thuộc exact `webFactId` trong immutable item. Scope của fact A
  không authorize fact B trong cùng provider result.
- Route/place factual web evidence chỉ làm premise khi exact/reviewed canonical assertion
  và query-specific scope decision xác nhận authoritative subpath/place.
  `scope_unresolved` giữ vai trò verification lead/gap, không làm premise;
  `scope_mismatch` bị loại.
- Web projection `ambiguous/unknown` không được nâng thành nationwide. Nationwide/general
  phải là explicit deterministic or operator-reviewed canonical claim.
- Web item chỉ satisfy requirement qua typed `WebRequirementContributionV6`: exact
  immutable fact hash + facet + eligible scope decision + semantic applicability. Scope
  match một mình không mark requirement satisfied. Fact extraction/AI output bị schema
  validate và không được invent location/path/facet/requirement IDs.
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
- exact included fact units, fact/title và bounded summary;
- per-contribution geographic relation/leg/requirement;
- contributing facet và contribution IDs;
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
  includedFactUnitIds: string[];
  excludedFactUnitIds: string[];
  serialization: string;
  renderTextHash: string;
  tokenizerVersion: string;
  tokenCount: number;
};
~~~

Selector chọn exact render variant, không chọn abstract card rồi để packer tự đổi
full/compact/minimal content. Token cost, fact content và provenance vì vậy không drift
sau selection.

Variant validator chạy trước selection và chứng minh mọi serialized fact unit có ít nhất
một eligible contribution candidate hoặc safe non-factual connective role. Selector sau
đó chọn/pin exact contribution IDs cho variant. Nếu không thể tách một hard-ineligible fact unit
khỏi card serialization, variant không eligible; không dùng compact summary để che việc
scope của underlying fact không rõ.

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

Selector phải chọn exact variant đã vừa budget. Packer không được âm thầm đổi sang smaller
variant sau selection. Nếu final pre-manifest capacity/source-handle state đổi, Retrieval
rerun selector với các precomputed variants rồi phát SelectionManifest mới; sau manifest,
không vừa thì omit/fail-safe với `budget_excluded`, không mutate selected fact content.
Không truncate giữa card/evidence hoặc tạo ad-hoc variant sau selection.

### Final re-check

Ngay trước render:

- card content version;
- lifecycle/evidence/source eligibility;
- policy;
- exact geo/facet/search dependency manifests và generations;
- route registry snapshot, OD assertion revision/effective-at compatibility;
- selected query-plan/execution identity versions.

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
  | "queried_place_local"
  | "off_route_before_origin"
  | "off_route_after_destination"
  | "off_selected_path"
  | "off_every_authoritative_path"
  | "path_dependent"
  | "path_choice_required"
  | "route_registry_partial"
  | "route_paths_ambiguous"
  | "route_no_path"
  | "corridor_general_soft"
  | "known_path_soft"
  | "scope_ambiguous"
  | "scope_unknown"
  | "facet_inapplicable"
  | "eligible_but_cap_excluded"
  | "requirement_cap_excluded"
  | "grey_band_cap_excluded"
  | "ai_batch_cap_excluded"
  | "web_query_cap_excluded"
  | "web_result_cap_excluded"
  | "render_item_cap_excluded"
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
  scopeDecisions: Array<{
    scopeDecisionId: string;
    factUnitId: string;
    scopeAssertionId: string;
    requirementKeyId: string;
    legId?: string;
    facet: TravelFacet;
    relation: GeographicRelationV6;
    authority: "hard" | "soft" | "none";
    eligible: boolean;
    semanticBand?: CandidateSemanticBand;
    selectedContributionId?: string;
    reasonCode: RetrievalReasonCodeV6;
  }>;
  scopeExpressionDecisions: ScopeExpressionDecisionV6[];
  selected: boolean;
  rendered: boolean;
  terminalReasonCode: RetrievalReasonCodeV6;
};

type PromptRenderManifestItemBaseV6 = {
  itemId: string;
  itemVersion: string;
  requirementKeyIds: string[];
  renderVariantId: string;
  renderTextHash: string;
};

type PromptRenderManifestItemV6 =
  | (PromptRenderManifestItemBaseV6 & {
      itemKind: "knowledge_card";
      internalContributionIds: string[];
      eligibilitySnapshotId: string;
      evidenceSetRevision: number;
      geoProjectionGeneration: string;
      facetProjectionGeneration: string;
      searchProjectionGeneration: string;
      caveatVersion?: string;
    })
  | (PromptRenderManifestItemBaseV6 & {
      itemKind: "web_evidence";
      webContributionBindings: Array<{
        contributionId: string;
        webFactId: string;
        webScopeAssertionId: string;
        webScopeDecisionId: string;
        webScopeDecisionHash: string;
      }>;
      webCaptureId: string;
      webResultPayloadHash: string;
      provider: string;
      capturedAt: string;
      webScopeProjectionId: string;
    });

type PromptRenderManifestV6 = {
  manifestId: string;
  runId: string;
  selectionManifestId: string;
  items: PromptRenderManifestItemV6[];
  renderedInternalContributionIds: string[];
  renderedWebContributionIds: string[];
  renderedRequirementOutcomes: EvidenceRequirementOutcomeV6[];
};
~~~

Persistence policy:

- `terminalReasonCode` chỉ tóm tắt lifecycle cuối của whole-card snapshot; hard scope,
  semantic và contribution replay luôn đọc exact per-requirement decision rows.
- Orchestration recompute requirement outcomes chỉ từ contribution IDs thực sự present
  trong exact rendered variants. Contribution không có fact/web-fact content trong
  `renderTextHash` không được tính covered.
- Required outcome trong PromptRenderManifest phải bằng hoặc an toàn hơn SelectionManifest.
  Nếu packing/revocation làm mất required contribution, discard/reselect hoặc emit explicit
  gap/fail-safe trước model call; không giữ `satisfied` từ selection-time state.

- Persist `QueryExecutionContextV6`, bounded sanitized query plan/hash, exact trip snapshot
  reference, resolved legs + authority/assertion revisions, config versions, counts per
  stage, selection manifest, prompt render manifest và exact provenance rows.
- Persist reason codes for selected/rendered and bounded top rejected candidates.
- Persist aggregate excluded counts for the remaining population.
- Full candidate traces chỉ cho versioned evaluation runs hoặc bounded diagnostic sampling; không mặc định lưu toàn corpus candidate list cho mọi query.
- Không persist raw AI reasoning.
- `usedInPrompt` được derive từ immutable PromptRenderManifest; không phải mutable flag
  mà Search/Retrieval có thể update độc lập.
- Card provenance pin content/evidence/eligibility/render variant và selected contribution
  IDs; web provenance pin immutable capture ID, payload hash, provider, captured time,
  scope projection và query-specific scope decision.
- Answer provenance withdrawal/removal contract hiện hữu tiếp tục áp dụng.

## Failure behavior

| Failure | Safe behavior |
|---|---|
| Query plan AI unavailable | Dùng deterministic plan; giữ ambiguity |
| Alias/entity ambiguous | Không invent ID; hỏi làm rõ khi material |
| No path (`route_no_path`) | Disable route-specific path evidence/hard exclusion; chỉ exact place + explicit nationwide/general evidence |
| Registry known partial | Soft positive trên known paths; không hard negative do absence |
| Multiple ambiguous paths | Bounded union soft, preserve ambiguity; hỏi làm rõ khi path thay đổi answer |
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
- one card with mixed place and path-interval claims;
- same card eligible for one leg/requirement and off-scope for another;
- deterministic per-requirement cap pressure and stable-order replay;
- legacy backfill that must remain ambiguous until operator review;
- web capture replay across registry/resolver versions;
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
    selectedPathRegistrySnapshotId?: string;
    state: "idea" | "planned" | "confirmed";
  }>;
  constraints: TypedTravelConstraints | null;
};

type CorpusFixtureManifestV6 = {
  id: string;
  registrySnapshotId: string;
  evaluatedAt: string;
  odCoverageAssertions: Array<{
    assertionId: string;
    revision: number;
  }>;
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
    legResolutionStates?: RouteResolutionStateV6[];
    hardScopeAuthorizationKinds?: HardScopeAuthorizationV6["kind"][];
    ambiguityCodes?: string[];
  };
  expectedStageDecisions: Array<{
    cardId: string;
    factUnitId?: string;
    scopeAssertionId?: string;
    legId?: string;
    stage: "eligibility" | "geography" | "candidate" | "selected" | "rendered";
    expected: "include" | "exclude" | "may_include";
    requirementKeyId?: string;
    geographicRelation?: GeographicRelationV6;
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
rendered hard-off-route fact units/assertions
/
all rendered route-scoped internal fact units/assertions
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
must-include requirement edges hard-excluded before lexical retrieval
/
all must-include requirement edges
~~~

Metric này bảo vệ recall khỏi route registry/parser quá tự tin.

#### Candidate recall

~~~text
must-include requirement edges present after candidate generation
/
all must-include requirement edges
~~~

Report theo overall và per facet/query class.

#### Candidate cap false-exclusion rate

~~~text
must-include requirement edges excluded only by candidate cap
/
all must-include requirement edges eligible immediately before cap
~~~

Report theo requirement, intent, facet và cap stage. `eligible_but_cap_excluded` không được
gộp vào lexical/semantic miss.

#### Final-set precision

~~~text
rendered relevant atomic fact/contribution units
/
all rendered internal atomic fact/contribution units
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
    safetyClass: "critical_authoritative" | "standard";
    minimumCandidateRecall: number;
    maximumHardFilterFalseExclusion: number;
    maximumCandidateCapFalseExclusion: number;
    minimumFinalSetPrecision: number;
    minimumRequiredRequirementCoverage: number;
  }>;
  maximumP95StageLatencyMs: Record<string, number>;
  maximumP95TotalLatencyMs: number;
  maximumAiCallRate: number;
  maximumWebCallRate: number;
  maximumCostPerSuccessfulAnswer: number;
  experimentGates: Array<{
    experimentId: "grey_band_ai" | "embedding" | "hybrid" | "topic_brief";
    primaryMetric:
      | "candidate_recall"
      | "final_set_precision"
      | "required_requirement_coverage"
      | "prompt_density";
    minimumAbsoluteUplift: number;
    guardrails: Array<{
      metric: string;
      maximumRegression: number;
    }>;
  }>;
  evidenceWindow: {
    minimumRunCount: number;
    minimumDurationHours: number;
  };
};
~~~

Numeric values có thể được benchmark/approve ở Bước 0, nhưng mọi later gate phải reference
exact profile version; không dùng cụm `approved threshold` hoặc `agreed threshold` không
có machine-readable identity.

Mọi `critical_authoritative` cohort phải có
`maximumHardFilterFalseExclusion = 0`, gồm selected/confirmed path boundary cases,
complete-OD must-include route assertions và destination half-open interval fixtures.
Critical must-include cap fixtures cũng có `maximumCandidateCapFalseExclusion = 0`.
Standard cohorts dùng numeric threshold được Bước 0 approve. Roadmap không dùng một câu
“zero false exclusion” blanket cho tất cả statistical/noisy cohorts.

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
- path-authority matrix and route-resolution-state transitions.
- mixed-claim no-cross-authorization and per-leg relation aggregation.
- scope-expression OR-of-AND truth table and hard-negative group behavior.
- facet/type mapping.
- intent-to-requirement profile expansion.
- canonical constraint-key derivation.
- legacy resolution method/status matrix.
- exact phrase normalization/source allowlist.
- query-plan schema validation.
- semantic band rules.
- stable per-requirement candidate ordering/cap behavior.
- per-search-unit lexical/vector feature isolation.
- marginal coverage selection.
- prompt whole-item packing.
- reason-code mapping.

Unit tests không cần PostgreSQL hoặc environment database.

### Integration tests

Dùng `pnpm test:integration` cho:

- Drizzle schema/migrations/index definitions.
- search projection lifecycle.
- per-projection dependency manifests and transitive generation invalidation.
- source-metadata isolation.
- actual PostgreSQL FTS behavior.
- unaccent/pg_trgm deployability nếu dùng.
- policy/evidence re-check.
- scope-first SQL allowlist.
- multi-leg/mixed-claim normalized assertion joins.
- immutable web scope projection and replay.
- web typed contribution and rendered-coverage reconciliation.
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
- `queried_place_local`
- `off_route_before_origin`
- `off_route_after_destination`
- `off_selected_path`
- `off_every_authoritative_path`
- `path_dependent`
- `path_choice_required`
- `route_registry_partial`
- `route_paths_ambiguous`
- `route_no_path`
- `scope_ambiguous`
- `scope_unknown`
- `corridor_general_soft`
- `known_path_soft`

### Semantic/facet

- `facet_inapplicable`
- `eligible_but_cap_excluded` with requirement key, cap stage and pre-cap rank
- `requirement_cap_excluded`
- `grey_band_cap_excluded`
- `ai_batch_cap_excluded`
- `web_query_cap_excluded`
- `web_result_cap_excluded`
- `render_item_cap_excluded`
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

Production `v6_active` cutover chỉ được phép sau deterministic baseline Bước 0–8 pass
release gates. Bước 9–13 vẫn optional/evidence-gated.

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
  - mixed place/path claims không cross-authorize route fact;
  - multi-leg card có relation khác nhau theo từng leg;
  - cap pressure giữ stable order và không loại must-include critical edge;
  - legacy backfill không tự thành exact/reviewed;
  - web scope projection replay đúng capture/hash/registry/resolver.
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
- Thêm versioned `IntentRequirementProfileV6`, `ConstraintRefV6` và canonical
  constraint-key derivation.
- Implement typed executable expansion-rule evaluator và golden query-plan -> exact
  requirement-key vectors, gồm repeated OD legs/comparison/constraint target cases.
- Thêm path-authority matrix; explicit/confirmed choices tách khỏi style/free-text inference.
- Version card type -> facet mapping.
- Implement deterministic Vietnamese entity/facet parser baseline.
- Load allowlisted Trip Project anchors/legs/constraints.
- Persist/query-plan telemetry version, không persist raw reasoning.
- Pin `evaluatedAt`, path authority rule, route resolution rule, intent profile,
  constraint-key và phrase-normalization versions trong execution identity.
- Add ambiguity behavior và concise clarification contract.

Acceptance:

- Multi-word entities resolve atomically.
- Multi-leg query không bị ép thành một origin/destination pair.
- EV/family constraints tạo đúng required/useful facets.
- Unknown constraint keys không vào retrieval/model.
- Stable constraint keys không phụ thuộc array order hoặc display label.
- Style/free-text path inference không cấp hard authorization.
- Deterministic plan chạy được khi AI planner unavailable.

### Bước 2: Minimal canonical route registry

Mục tiêu: deterministic product-domain route scope không phụ thuộc text similarity.

Công việc:

- Tạo versioned locations/aliases, physical segments, paths và memberships.
- Tạo OD coverage assertions.
- Seed only supported product locations/segments/path alternatives.
- Implement forward/reverse traversal validation.
- Version assertions bằng immutable ID/revision/effective window và pin exact assertion
  vào resolved leg/execution.
- Implement distinct `authoritative_selected`, `authoritative_complete`, `known_partial`,
  `ambiguous_paths` và `no_path` states.
- Define Trips-owned canonical refs/confirmation contract; cho đến khi implemented,
  current free-text labels không cấp confirmed path authority.
- Không tạo GIS/distance/live routing.

Acceptance:

- Shared segment giữa standard/coastal/scenic paths giữ một segment ID.
- Hà Nội -> Đà Nẵng subpath resolve đúng endpoints/direction.
- Reverse query tạo reversed usable sequence hoặc unresolved.
- Historical replay dùng exact assertion revision và `evaluatedAt` cho cùng decision.
- Partial registry không hard-exclude theo absence.
- Complete OD/selected path cho phép classify before/after/off-path.

Gate:

- Registry validation pass; no broken segment/location sequence.

### Bước 3: Card geography/facet/search projections

Mục tiêu: current, replayable derived state cho allowlist và lexical retrieval.

Công việc:

- Add versioned atomic fact units, scope assertions và geo/facet/search projections.
- Treat fact unit as one projection-local reference to Knowledge-owned atomic card, not
  a new claim aggregate; ambiguous mixed-fact cards return to Knowledge workflow.
- Deterministic exact alias/route parser.
- Operator-reviewed status qua existing operational process hoặc code-reviewed registry; không cần admin UI mới trong tranche.
- Mở rộng derived work identity thành
  `(projectionKind, cardId, projectionGeneration, dependencyDigest)`; mỗi kind dùng
  dependency manifest riêng, không tái sử dụng current unique
  `(cardId, contentVersion)` marker nguyên trạng.
- Define one idempotent enqueue/claim contract nhận exact work identity trên; uniqueness,
  retry và completion fence đều so sánh full identity, không chỉ card/content version.
- Registry release đi qua draft -> validate -> atomic activate; activation tạo durable
  rebuild generation/fan-out, theo dõi completeness và có non-destructive rollback về
  prior active snapshot/read mode.
- Separate semantic text hash from geo/policy version.
- Implement status/method matrix; `legacy_backfill` chỉ ambiguous/unknown.
- Implement exact phrase source allowlist và pinned normalization version.
- Add stale projection fail-closed behavior.

Acceptance:

- `Đà Nẵng - Quy Nhơn` maps exact/reviewed segment IDs hoặc remains ambiguous; không map nhầm nationwide.
- Place metadata assertion không được link route/driving facet của primary fact.
- Scope expressions have explicit OR-of-AND semantics and reject empty/mixed invalid groups.
- Search units pin exact facet assertion/scope expression; supporting-field phrase cannot
  boost unrelated requirement edge.
- Source metadata absent khỏi search text/vector input.
- Mỗi projection carries exact dependency manifest và generation; search references exact
  geo/facet generations.
- Registry/taxonomy/search-algorithm bump rebuild được card dù contentVersion không đổi.
- Card lifecycle/content/geography change tạo correct rebuild/disable.

### Bước 4: Scope-first relational allowlist

Mục tiêu: off-route/policy/facet candidates bị loại trước lexical/vector/AI.

Công việc:

- Implement eligibility predicate.
- Implement interval/path relation classifier.
- Emit per `(card, fact unit, assertion, requirement, leg)` scope decisions; không dùng
  candidate-level scalar relation làm authority.
- Implement selected path, complete alternatives và partial registry modes.
- Implement exact queried-place/origin/destination/planned-stop rules.
- Implement explicit nationwide pool.
- Add query-stage counts và reason codes.
- Implement hard/soft behavior cho five route resolution states.

Acceptance:

- Hà Nội -> Đà Nẵng excludes Đà Nẵng -> Quy Nhơn trước semantic retrieval khi authority đủ.
- Card có place claim tại Đà Nẵng và path interval Đà Nẵng -> Quy Nhơn vẫn bị loại khỏi
  Hà Nội -> Đà Nẵng route requirement; independent eligible local fact chỉ dùng được qua
  exact fact/facet/assertion edge.
- Multi-leg query persist relation/reason riêng cho từng leg.
- Destination-local food/hotel eligible only for destination facets.
- Unknown route/place card không trở thành generic advice.
- Partial registry preserves recall and emits `route_registry_partial`.
- No policy/geography hard-excluded card reaches AI.

Gate:

- Zero off-route leakage trên authoritative release cases.
- Hard-filter false exclusion bằng 0 cho `critical_authoritative` cohorts; standard
  cohorts đạt exact numeric threshold của pinned gate profile.

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
- Implement requirement-partition stable ordering và cap sau lexical features; không
  `LIMIT` theo unspecified database order.
- Compute lexical/semantic feature identity per search-unit + requirement + leg, not card only.
- Persist bounded `eligible_but_cap_excluded` diagnostics và aggregate cap counts.
- Use `plainto_tsquery`/`phraseto_tsquery` for sanitized query construction; không
  concatenate raw traveler input vào `to_tsquery`.
- Optional `pg_trgm` only for alias/typo resolution.
- Compare against field-aware non-FTS baseline.

Acceptance:

- Diacritic/unaccent queries retrieve same canonical entities without token fragment leakage.
- `Cam Lộ - La Sơn` treated as phrase/entity.
- Generic `lịch trình/tư vấn/gợi ý` không tạo geographic score.
- Repeated identical run/config cho cùng per-requirement pool tạo cùng kept/cap-excluded edges.
- Must-include cap exclusion đạt threshold theo exact gate-profile cohort.
- FTS candidate recall improves or equals baseline without precision regression.

Gate:

- Deployment/migration/index behavior verified in integration tests.
- Indexing worker and request query use exact same text-search config/normalization version.

### Bước 6: Facet pools và marginal coverage selector

Mục tiêu: final internal evidence set covers traveler need under budget.

Công việc:

- Build requested evidence requirements.
- Generate requirements trước retrieval; generate `CandidateRequirementContributionV6`
  chỉ sau scope/semantic decision.
- Rank within facet pools.
- Implement marginal gain/greedy selection.
- Generate baseline validated render variants trước selector; add redundancy và exact
  per-variant token-cost estimation.
- Replace obsolete target-count/type-quota decisions only after Bước 0 PRD sparse-web
  update is approved; trước đó giữ compatibility `< 3` trigger nhưng không dùng count
  để chọn off-scope/internal evidence.
- Persist typed `SelectionManifestV6` với exact scope relation, leg, band, origin,
  relevance, freshness và selected contribution IDs.

Acceptance:

- Broad itinerary có route/stop/warning coverage khi evidence tồn tại.
- Intent profile tạo minimum keys cho itinerary/route/place/comparison/verification;
  `general` không che missing structured requirement.
- Ba cards cùng facet không lấn card required facet chỉ vì score gần nhau.
- Card covering two facets counted/rendered once.
- Missing facet remains explicit.
- Selection deterministic under same versions/query plan.
- SelectionManifest pins exact render variant/hash/token count; packer cannot substitute.

### Bước 7: Gap-aware web fallback và joint packing

Mục tiêu: external search đúng facet và được pack/provenance an toàn.

Công việc:

- Detect missing/fresh facet trước final pack.
- Build scoped web query per facet.
- Build immutable `WebEvidenceScopeProjectionV6` pinned capture/hash/registry/resolver,
  rồi compute query-specific web scope decision per requirement/leg.
- Build typed web fact/facet/semantic contribution; scope match alone cannot satisfy gap.
- Post-filter result quality/geographic terms bằng canonical claims; unresolved result chỉ
  là verification lead, không phải premise.
- Joint-pack internal/web items theo priority.
- Preserve unverified/freshness caveat.
- Verify rendered-only usage ledger.

Acceptance:

- Fresh route warning triggers scoped web fallback.
- Replaying same capture/projection/query snapshot yields same web scope decision.
- Payload/registry/resolver change cannot reuse stale web scope projection.
- Missing food facet không tự gọi unrelated broad search nếu not required/fresh.
- Web failure produces explicit inability-to-verify wording.
- Web contribution and exact rendered fact hash are present before requirement is satisfied.
- Unrendered web/internal items not marked used in prompt.

### Bước 8: Prompt budget và provenance scale

Mục tiêu: tăng evidence capacity mà không mất scope/attribution correctness.

Công việc:

- Separate history/internal/web/general budgets.
- Expand/optimize pre-selection whole-item compact/minimal variants without changing
  selection/manifest ownership.
- Render variants enumerate included/excluded fact units và reject co-rendered
  hard-ineligible facts.
- Bound source handles and diagnostic snapshots.
- Final version/policy/projection re-check.
- Recompute rendered requirement outcomes from contribution IDs actually present in exact
  PromptRenderManifest variants.
- Withdrawal/removal regression tests.

Acceptance:

- Prompt never contains arbitrary-truncated fact/card text; every variant contains only
  validated whole fact units.
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
- Query vector only trên search units/requirement edges đã pass scope expression; không
  reuse card-level similarity across facet/leg.
- Compare union/normalized fusion/RRF.
- Measure candidate recall, facet coverage, latency, cost và operational burden.

Acceptance:

- Vector adds unique relevant candidates.
- No source/operator metadata leakage.
- Policy/geo changes disable/filter without hidden stale eligibility.
- Hybrid beats FTS-only on exact `hybrid` experiment primary metric while every pinned
  guardrail remains within threshold.

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
type TravelerMemoryRecordBaseV6 = {
  memoryRefId: string;
  ownerReference:
    | {
        kind: "chat_context_row";
        rowId: string;
        rowUpdatedAt: string;
        sourceMessageId: string;
        valueHash: string;
      }
    | {
        kind: "trip_project_field";
        tripProjectId: string;
        aggregateVersion: number;
        fieldKey: string;
      }
    | {
        kind: "trip_constraints_row";
        tripProjectId: string;
        version: number;
        fieldKey: string;
      }
    | {
        kind: "trip_plan_item";
        itemId: string;
        itemVersion: number;
        fieldKey: string;
      };
  scope: "conversation" | "trip_project";
  authority: "selected_trip" | "current_conversation";
  sourceMessageId?: string;
};

type TravelerMemoryRecordV6 = TravelerMemoryRecordBaseV6 &
  (
    | {
        recordType: "start_location";
        value: {
          canonicalLocationId?: string;
          boundedLabel: string;
        };
      }
    | {
        recordType: "traveler_party";
        value: {
          adultCount?: number;
          childCount?: number;
          children: TypedTravelConstraints["children"];
        };
      }
    | {
        recordType: "travel_constraints";
        value: TypedTravelConstraints;
      }
    | {
        recordType: "trip_route_reference";
        value: {
          originLocationId?: string;
          destinationLocationId?: string;
          selectedPathId?: string;
          registrySnapshotId?: string;
        };
      }
    | {
        recordType: "prior_trip_reference";
        value: {
          tripProjectId: string;
          explicitlyLinkedInCurrentOwnerContext: true;
        };
      }
  );

type TravelerMemorySnapshotV6 = {
  id: string;
  userId: string;
  conversationId: string;
  tripProjectId: string | null;
  tripAggregateVersion: number | null;
  records: TravelerMemoryRecordV6[];
  conflicts: Array<{
    recordType: TravelerMemoryRecordV6["recordType"];
    selectedTripMemoryRefId: string;
    lowerPriorityMemoryRefId: string;
  }>;
  serializationHash: string;
};
~~~

Precedence:

1. User-confirmed selected Trip Project structured state.
2. Current conversation correction that has not yet mutated selected Trip state, exposed
   as a conflict/clarification rather than silent override.
3. Current conversation travel context.

Không có global/cross-conversation memory lookup trong v6.1. Prior trip chỉ xuất hiện khi
current conversation hoặc selected Trip Project đã explicit link typed Trip reference;
Retrieval không quét conversation khác của user để suy ra preference.

Correction/supersession:

- Current `chat_context` là row-based nhưng không có version column. Adapter pin exact row
  ID + `updatedAt` + value hash + source message; correction/deletion đi qua Chat/Trips
  owner behavior và new snapshot chỉ chọn current active rows. Không dùng
  `conversation.lifecycleVersion` như context version.
- Current Trip constraints pin `(tripProjectId, version)` của aggregate row; plan item pin
  `(itemId, version)`; top-level Trip fields pin `tripProjects.aggregateVersion`.
- Nếu future schema thêm item-level correction, owner mới được tạo explicit
  replacement/supersession relation qua separate approved artifact/migration.
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

Gate trước implementation:

- Bước 12 trước hết chỉ evaluation current Chat/Trips behavior. Mọi persistent record/item
  version hoặc supersession model mới phải được PRD/architecture approve và owned bởi
  Chat/Trips; Retrieval không tự tạo memory aggregate.
- Fixture chứng minh snapshot adapter lossless với current aggregate schema trước khi cân
  nhắc schema mới.

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
- Hard-filter false exclusion meets pinned gate profile; critical-authoritative
  must-include requirement edges/assertions have zero false exclusion.
- Mixed-claim and multi-leg fixtures prove no cross-claim/cross-leg authorization.

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
- Web premises pin exact immutable scope projection and query-specific decision.

### Operational gate

- p95 stage/total latency within AI Ask budget.
- AI/web call rate and cost bounded.
- Index/backfill/Worker fencing/retry behavior demonstrated.
- Per-requirement cap ordering/replay deterministic; cap-excluded must-include rate meets
  pinned cohort threshold.
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

Route registry là deterministic reference model, không phải semantic knowledge graph. Không build GraphRAG trong v6.1.

### Autonomous tool calling

Answer model không tự gọi retrieval/search. Server-controlled stages giữ policy, budget và provenance.

### External traveler-memory framework

Không thêm Mem0, Zep hoặc LangMem trước measured failure của `chat_context`/Trip Project context.

### Automatic decay

Không suppress card theo age hoặc embedding similarity. Freshness policy, verification workflow và explicit evidence lifecycle vẫn là authority.

## Thứ tự triển khai tóm tắt

~~~text
0.  Evaluation-first baseline + source metadata isolation
1.  Shared query/facet/constraint/path-authority contracts
2.  Minimal route registry + immutable OD authority
3.  Atomic fact/scope + dependency-aware projections
4.  Per-requirement/per-leg scope allowlist
5.  Weighted FTS + deterministic requirement caps
6.  Typed contributions + marginal coverage selection
7.  Replayable web scope projection + joint packing
8.  Fact-unit-safe prompt variants + bounded provenance
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
- Geographic decision được pin per fact/assertion/requirement/leg; place claim không
  override off-route interval.
- Explicit/confirmed/complete-OD authority tách khỏi partial/ambiguous/soft inference.
- Physical route segment không bị duplicate theo path.
- Registry partial không tạo hard negative sai.
- Search projection không chứa source/provenance lexical fields.
- Geo/facet/search/vector projections khai báo exact per-projection dependency manifests.
- PostgreSQL FTS baseline đạt candidate recall/final precision gates.
- Candidate caps có stable order, reason và must-include exclusion metric.
- Final evidence selection đáp ứng required requirement keys bằng deterministic marginal coverage.
- Selection manifest pin typed candidate contributions thay vì suy ngược từ selected cards.
- Missing/fresh facets được xử lý trước joint prompt packing.
- Web result dùng immutable scope projection; unresolved/mismatched scope không làm premise.
- AI/vector/RRF không được đưa vào production nếu không có measured uplift.
- Every rendered card/web item có exact, current provenance; unrendered items không được đánh dấu used.
- Traveler memory tiếp tục tuân thủ correction, priority, privacy và deletion contracts hiện hữu.

## Tham chiếu

- V5 superseded: `docs/roadmaps/retrieval-va-tri-nho-traveler-v5.md`
- V6 superseded by this revision when approved: `docs/roadmaps/retrieval-va-tri-nho-traveler-v6.md`
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
