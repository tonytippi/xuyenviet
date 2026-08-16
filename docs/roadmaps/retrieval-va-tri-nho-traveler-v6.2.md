# Lộ trình Retrieval & Trip-aware Planning Context - Phiên bản 6.2

> **Clean-break override — 2026-08-16.** Epic 21 is now implemented before any
> production user or durable traveler data exists. Product outcomes in this roadmap
> remain authoritative, but all sections prescribing dual write, shadow comparison,
> persisted qualification profiles, read policies, cutover records, compatibility
> modes, or a legacy rollback window are superseded. The active implementation uses
> one direct required-need path, at most one new planning-context table, one forward
> migration (`0073_clean_break_trip_aware_planning.sql`), and the repository's guarded
> reset/migrate/seed flow for explicitly disposable targets. If a non-disposable target
> or durable user data is discovered, implementation must stop and return to an
> expand-migrate-contract design. See AD-37/AD-38 and
> `retrieval-trip-aware/evaluation-and-release-gates.md` for the active release contract.

## Trạng thái

Đề xuất ngày 2026-08-11, kế thừa và rebaseline v6.1
(`docs/roadmaps/retrieval-va-tri-nho-traveler-v6.1.md`). Khi được approve, v6.2 thay thế
v6.1 làm roadmap hiện hành; v5, v6 và v6.1 chỉ còn vai trò lịch sử/review evidence.

V6/v6.1 chưa được triển khai, nên v6.2 không tạo song song một runtime generation mới.
Các proposed code symbols/read modes vẫn dùng suffix `V6` và `v6_*`; stories phải
implement contract trong v6.2, không contract cùng tên ở roadmap cũ.

Đây là **change-source production-oriented để cập nhật PRD trước**, đồng thời cung cấp
roadmap kỹ thuật chi tiết và architecture slice định hướng. Nó không tự thay đổi PRD,
Architecture Spine hoặc Epic 16 và chưa phải build plan được phê duyệt. Product behavior
trong `PRD Change Ledger` phải được Product approve và đưa vào PRD; cơ chế kỹ thuật phải
được đưa vào Architecture Spine/addendum. Chỉ sau hai bước đó mới tạo epics/stories,
kiểm tra implementation readiness và sprint planning theo workflow BMad của dự án.

V6.2 giữ toàn bộ hardening đã qua review ở v6.1 và sửa một mô hình nền tảng còn sai:

- Trip Project là aggregate sở hữu kế hoạch, thông tin và hành trình bền vững của một trip.
- Primary conversation là plan-authoring/command surface; transcript và `chat_context`
  không phải một planning source of truth cạnh tranh với Trip Project.
- Current-turn intent, hypothetical route và pending proposal có thể định hướng retrieval
  để khảo sát thay đổi, nhưng không trở thành committed Trip state trước confirmation.
- Retrieval phải phân biệt rõ `current_plan`, `explore_change`, `validate_proposal` và
  `unscoped_answer`; không dùng một precedence list giữa “Trip memory” và “chat memory”.
- Mọi answer/proposal dùng Trip state phải pin exact aggregate/item versions; proposal
  chưa apply không silently thay context của lượt sau.

V6.2 tiếp tục đóng các lỗ hổng contract đã được phát hiện trong các review v6/v6.1:

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

V6.2 vẫn giữ các thay đổi phương pháp lớn từ v6/v6.1:

- Dùng **Scope-first Faceted Retrieval Cascade**: policy và geographic/facet allowlist được xác lập trước lexical/vector retrieval.
- Tách physical route segment khỏi path membership để một đoạn đường có thể thuộc nhiều route alternative mà không duplicate semantic identity.
- Không dùng `extractionConfidence` làm quyền hard-filter; dùng resolution status và provenance deterministic/reviewed.
- Đưa evaluation harness và negative fixtures lên Bước 0, trước mọi thay đổi lớn.
- Dùng weighted PostgreSQL FTS và exact canonical signals làm baseline production.
- Chọn evidence bằng marginal facet coverage dưới prompt budget, không bằng top-K hoặc type quota.
- Chỉ dùng AI cho semantic grey band; không adjudicate mọi candidate mặc định.
- Chỉ thêm embeddings, RRF hoặc reranker khi evaluation chứng minh một retrieval gap cụ thể.
- Phát hiện missing/freshness-sensitive facets và gọi web fallback trước final evidence packing.

## Review preservation ledger

V6.2 không reopen các seam đã được review/harden trừ khi PRD change ledger yêu cầu product
decision mới. Story/architecture update phải trace các dòng sau để tránh regression:

| Review seam | Contract được giữ hoặc tăng cường trong v6.2 |
|---|---|
| Multi-claim geography cross-authorization | Atomic fact/scope assertion; decision per requirement/leg |
| `caveat_only` lệch PRD/AD-17 | Internal premise chỉ `contextual_use`; otherwise gap/web verification |
| Registry/projection rebuild fencing | Full projection dependency identity; draft/validate/atomic activate/rollback |
| Corridor scope ambiguity | Explicit soft corridor/path relations; không authorize local applicability |
| Hard-decision replay thiếu inputs | Pin plan, aliases, assertions, registry, configs, typed reason codes |
| Web geography fail-open | Immutable web fact/assertion/decision chain; unresolved không làm premise |
| Sparse `< 3` conflict | `PCR-01`; compatibility trigger chỉ trước approved cutover |
| Non-executable gates | Versioned numeric profile theo cohort, stage, experiment và guardrail |
| Memory under-specified | Thay bằng Trip-owned snapshot + ephemeral current-turn/proposal model |
| Atomic fact identity/lifecycle | One Knowledge-owned atomic card, one projection-local fact reference |
| Selector/packer variant drift | Selection pin exact render variant; packer không tự đổi variant |
| Card-level precision hides mixed facts | Precision/coverage ở atomic contribution/fact-unit level |
| Complete-OD replay | Pin assertion ID, revision, registry snapshot và effective time |
| Eligibility over-authorizes facet | Eligibility chỉ policy permission; facet/scope authority ở projection decision |
| Pre-selection scope validation | Candidate contribution phải pass exact scope expression before selection |
| Path-dependent contribution | Không satisfy unconditional requirement; matched/excluded/unresolved được persist |
| `usedInPrompt`/`citedInAnswer` regression | Same-turn rendered-handle ledger; hai persisted facts tách biệt |
| Trip/chat peer-memory model | Epic 16/AD-29: Trip owns plan; chat only authors proposal/commands |

Nếu một downstream story bỏ một contract trong bảng, story phải chỉ ra PRD/Architecture
decision mới đã supersede nó; không được đơn giản dựa vào current code divergence.

## Mục tiêu

V6.2 phải giúp một traveler thật nhận được guidance đúng với **kế hoạch đã cam kết**,
đồng thời có thể an toàn khám phá và xác nhận thay đổi qua chat. Retrieval phải trả lời
được sáu câu hỏi theo đúng thứ tự:

1. Lượt này đang hỏi về current Trip plan, khảo sát thay đổi, validate proposal hay không
   gắn Trip nào?
2. Trip state nào đã được user-confirmed và version nào là authority cho lượt này?
3. Card này hiện có được phép dùng cho traveler không?
4. Fact của card có thuộc geographic scope/direction của mode đang xét không?
5. Card có đóng góp cho facet/constraint traveler đang hỏi không?
6. Trong các card hợp lệ, tập evidence nào tạo coverage tốt nhất trong prompt budget?

Text similarity chỉ hỗ trợ câu hỏi 5 và thứ tự ưu tiên trong câu hỏi 6. Nó không được
cấp quyền quyết định committed Trip state, planning mode, eligibility hoặc geography.

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
- Versioned Trip Project planning snapshot làm durable planning authority.
- Current-turn intent/hypothetical/proposal context tạm thời cho exploration và change drafting.
- Traveler-facing behavior khi route partial/ambiguous/outside supported coverage, evidence
  thiếu hoặc prompt/candidate budget không đủ.
- PRD change ledger, production journeys, product acceptance outcomes và rollout gates.

### Ngoài phạm vi

- Dynamic routing, ETA, live traffic, weather, road closure hoặc Google Maps/Routes.
- GIS distance/radius engine và automatic near-route inference.
- Universal Vietnam road graph.
- External vector store làm source of truth.
- GraphRAG, autonomous retrieval tools hoặc answer-model-owned retrieval.
- Mem0, Zep, LangMem hoặc traveler-memory framework mới.
- Automatic knowledge decay dựa trên age/similarity.
- New microservice, queue, deployment workload hoặc environment variable chỉ để phục vụ roadmap này.
- Tự động apply Trip Change Proposal hoặc biến transcript thành structured Trip state.
- Cross-trip/global preference memory không được người dùng explicit link/approve.

## Assumptions cần được xác nhận qua implementation artifacts

- [ASSUMPTION] Initial production release tiếp tục tập trung Hanoi-to-HCMC corridor và
  corpus ban đầu ở quy mô hàng trăm, chưa phải hàng triệu card; coverage boundary phải
  được traveler thấy rõ và không được gọi là Vietnam-wide routing.
- [ASSUMPTION] PostgreSQL production target cho phép extension `unaccent`; `pg_trgm` chỉ được dùng nếu migration/deployment spike xác nhận an toàn.
- [ASSUMPTION] Canonical route registry ban đầu được quản lý như versioned, code-reviewed reference data; chưa cần admin UI mới.
- [DECIDED BY PRD/AD-29] Trip Project sở hữu structured plan; primary conversation chỉ là
  plan-authoring surface. `chat_context` và transcript không là itinerary writer/source of truth.
- [OPEN FOR PRD/ARCHITECTURE] Canonical path representation nào được thêm vào Trip-owned
  structured state, proposal operations nào có thể create/select/replace nó, và trạng thái
  nào được phép cấp hard route authority.
- [ASSUMPTION] Prompt/source budget cụ thể được benchmark trên model đang active; roadmap chỉ cố định nguyên tắc whole-card packing, không cố định số card.

## Baseline hiện tại

### Product và kiến trúc

- `knowledge_cards` là atomic, evidence-grounded planning facts và là knowledge source of truth.
- Trip Project structured aggregate là confirmed planning source of truth cho một trip.
- Primary conversation là plan-authoring surface. `chat_context`/transcript có thể giữ
  conversational continuity hoặc uncommitted intent nhưng không là alternative itinerary writer.
- Applied Trip Change Proposal mới thay đổi persistent plan; pending/dismissed/expired proposal
  không tự thay retrieval context của current plan.
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

- V6.1 còn mô hình hóa `selected_trip` và `current_conversation` như hai memory authority
  có precedence. Điều này trái PRD 10.7 và AD-29. V6.2 loại mô hình peer-memory này:
  committed Trip snapshot và transient turn/proposal intent là hai loại input khác bản chất.
- PRD/Architecture chưa phê duyệt exact canonical route/path fields trong Trip aggregate.
  V6.2 có thể định nghĩa product outcome và contract đề xuất, nhưng implementation phải
  chờ PRD/Architecture update cùng forward migration/proposal operations tương ứng.

- Architecture AD-17 và PRD hiện hành chỉ cho internal traveler retrieval khi
  `verification_requirement = none` và policy là `contextual_use`; `operator_required`,
  pending, conflicted hoặc failed-verification phải bị exclude.
- Code hiện tại vẫn có branch `caveat_only` cho `operator_required`. V6.2 không ratify
  divergence này: internal retrieval chỉ dùng `contextual_use`. Item cần operator
  verification trở thành evidence gap/web-verification trigger, không vào source bundle
  như knowledge-card premise.
- PRD hiện tại trigger web search khi broad planning query có ít hơn ba relevant active
  cards. V6.2 muốn thay count semantics bằng unsatisfied requirement keys. Bước 0 phải cập
  nhật/approve PRD contract này; trước khi approval hoàn tất, production giữ compatibility
  trigger `< 3` bên cạnh gap-based telemetry.

## PRD Change Ledger

Mục tiêu của ledger này là cung cấp change-source ở mức product behavior. PRD update
không copy DTO, table, hash, registry mechanics hoặc numeric runtime config từ các phần
kỹ thuật phía sau. Mỗi `PCR-*` phải được Product quyết định, gắn stable FR/AC hiện hành
hoặc tạo FR/AC mới, rồi mới chuyển phần `Architecture/Eval follow-up` sang artifact sau.

### Foundation đã được chốt, không mở lại

| ID | Product invariant hiện hành | Hệ quả bắt buộc cho PRD update |
|---|---|---|
| `PBF-01` | Chat là command surface; Trip Project là confirmed state surface | Không mô tả chat memory như kế hoạch song song |
| `PBF-02` | Trip Project sở hữu structured plan, constraints, proposals và history | Persistent route/path/stop được thêm phải thuộc Trip aggregate |
| `PBF-03` | Primary conversation là exclusive plan-authoring surface | User yêu cầu thay đổi qua chat; không thêm hidden writer |
| `PBF-04` | Chỉ owner-confirmed Trip Change Proposal mới mutate plan | AI answer, extraction và retrieval không trực tiếp apply |
| `PBF-05` | Unscoped/private answer không tự attach Trip | Product vẫn cho phép hỏi riêng và explicit continue/save |

### Product changes được đề xuất

#### PCR-01 — “Sparse” dựa trên planning-need coverage, không dựa trên card count

**Current conflict:** PRD fallback contract và code hiện tại dùng `< 3 relevant active cards`
cho broad planning query. Ba card trùng facet có thể vẫn bỏ trống nhu cầu quan trọng; một
card atomic phù hợp có thể đã đủ cho câu hỏi hẹp.

**Proposed PRD behavior:**

- Web fallback chạy khi một required planning need chưa có evidence áp dụng, khi detail
  freshness-sensitive cần kiểm tra, hoặc khi internal evidence có conflict/uncertainty
  không thể trình bày an toàn.
- Số card không tự quyết định sparse/sufficient.
- Trong migration window, `< 3` chỉ là compatibility trigger; phải có ngày/điều kiện retire.
- Web failure không cho phép lấp gap bằng card khác facet hoặc khác route.

**Product acceptance:** một broad answer không được coi là đủ chỉ vì đạt card count; mọi
required need phải được answer, surfaced như limitation hoặc chuyển thành concise question.

**Architecture/Eval follow-up:** requirement keys, facet vocabulary, coverage selector,
compatibility telemetry và retirement gate.

#### PCR-02 — Phân biệt recent warning với live routing authority

**Proposed PRD behavior:**

- XuyenViet không tuyên bố live navigation, authoritative closure status, live traffic hoặc
  guaranteed safe route nếu chưa có approved provider/capability.
- Recent official/community warning có thể được trình bày như external verification guidance
  khi source, nơi/thời gian áp dụng và giới hạn đã rõ.
- “Có cảnh báo gần đây” không đồng nghĩa “đường hiện đang đóng/mở”; answer chỉ rõ cần kiểm
  tra gì trước khi đi.
- Search/provider outage phải hạ certainty và cung cấp action thực tế, không suy đoán status.

**Product acceptance:** zero answer biến stale/recent warning thành live route fact; mọi
changing route/safety recommendation có verification guidance phù hợp.

**Architecture/Eval follow-up:** freshness class, valid time window, provider policy,
web-scope decision và safety cohort.

#### PCR-03 — Traveler outcome cho route no-path, partial và ambiguous

**Proposed PRD behavior:**

- `No supported path`: vẫn trả origin/destination/place/general guidance có scope rõ nếu
  hữu ích; không claim card áp dụng cho toàn tuyến.
- `Partial coverage`: trả phần đã biết, liệt kê phần chưa thể áp dụng và next action; không
  dùng known partial graph để hard-exclude mọi alternative ngoài registry.
- `Ambiguous material paths`: nếu câu trả lời khác đáng kể theo path, trình bày bounded
  alternatives hoặc hỏi một câu chọn route style/path; vẫn trả guidance không phụ thuộc path.
- Clarification-only response chỉ hợp lệ khi không có phần guidance nào an toàn/hữu ích.

**Product acceptance:** cùng một resolution outcome luôn dẫn tới class traveler behavior
nhất quán; không im lặng rơi về generic answer hoặc route claim quá scope.

**Architecture/Eval follow-up:** `RouteResolutionStateV6`, path authority matrix, fixtures
và reason codes.

#### PCR-04 — Degradation khi candidate/prompt budget không đủ

**Proposed PRD behavior:**

- Required safety/route constraints được ưu tiên hơn optional inspiration.
- Nếu không thể cover mọi required need, answer phải nói ngắn gọn phần đã cover, phần còn
  thiếu và đề nghị thu hẹp/chọn ưu tiên; không silent omit.
- Hệ thống vẫn đưa initial useful guidance khi có evidence an toàn, thay vì biến mọi cap
  thành clarification-only.
- Không dùng unrelated evidence để làm answer có vẻ đầy đủ.

**Product acceptance:** zero silent required-need omission trong release dataset; partial
answer luôn có bounded limitation và permitted next action.

**Architecture/Eval follow-up:** selector order, token/candidate caps, contribution-level
coverage metric và latency/cost profile.

#### PCR-05 — Canonical Trip path là Trip-owned production capability

Ownership không còn là open question: durable route/path thuộc Trip Project. Product cần
phê duyệt exact capability để người dùng thực tế không phải xác nhận lại route qua từng chat.

**Proposed PRD behavior:**

- Trip Project có thể lưu route/path được người dùng chọn cho từng relevant leg, cùng
  state phù hợp (`idea | planned | confirmed | backup`).
- Chat có thể khảo sát path khác và tạo typed proposal để create/select/replace path.
- Chỉ proposal được apply mới đổi current Trip plan; pending proposal không silently ảnh
  hưởng answer về kế hoạch hiện tại.
- Khi registry/provider representation thay đổi, UI không tự chuyển plan sang path khác;
  traveler nhận refresh/review flow khi material meaning thay đổi.
- Free-text route label chỉ là input cần resolve/confirm, không tự trở thành canonical path.

**Product acceptance:** mở lại Trip và hỏi tiếp cho kết quả dựa trên exact committed path;
khảo sát detour không làm mất/đổi path hiện tại trước confirmation.

**Architecture/Eval follow-up:** Trip plan operation/schema, registry reference/version,
proposal fences, migration, stale-path recovery và deletion propagation.

#### PCR-06 — Supported coverage là product boundary công khai

**Proposed PRD behavior:**

- Product công bố supported route/geography coverage ở mức traveler hiểu được; không
  mô tả registry như universal Vietnam road graph.
- Ngoài supported coverage, XuyenViet có thể cung cấp general/place guidance hoặc scoped
  external references, nhưng không claim end-to-end route applicability.
- Coverage thiếu không được che bằng nationwide card, source prestige hoặc semantic similarity.
- Traveler được hướng dẫn chọn route rõ hơn, kiểm tra external source hoặc tiếp tục với
  answer giới hạn tùy use case.

**Product acceptance:** zero known outside-coverage route claim được trình bày như supported;
limitation copy luôn có practical next action.

**Architecture/Eval follow-up:** coverage assertions, registry release, product-copy projection.

#### PCR-07 — Unresolved/mismatched web geography không được làm factual premise

**Proposed PRD behavior:**

- Route/place web fact chỉ được dùng làm factual premise khi nơi/đoạn/thời gian áp dụng đã
  resolve phù hợp với query scope.
- Result unresolved được giữ như verification lead/gap, không satisfy required planning need.
- Explicit nationwide/general evidence được dùng cho general need riêng, không authorize
  local/route applicability.
- Search query phải minimize private Trip constraints; chỉ gửi phần cần thiết cho gap.

**Product acceptance:** zero external result khác route/place được dùng để justify local
recommendation; unresolved result luôn được diễn đạt như điều cần kiểm tra.

**Architecture/Eval follow-up:** `WebEvidenceItem`, assertion/scope decision chain, query
minimization và provenance mapping.

#### PCR-08 — Phân biệt current plan, explore change và proposal validation

**Proposed PRD behavior:**

- Answer phải xác định traveler đang hỏi về kế hoạch hiện tại, khảo sát thay đổi, review
  proposal hay hỏi riêng không gắn Trip.
- Trong current-plan answer, chỉ applied Trip state là authority.
- Trong exploration, proposed route/constraint chỉ là hypothetical; answer so sánh ảnh
  hưởng và có thể tạo proposal nhưng không nói kế hoạch đã đổi.
- Trong proposal review, answer nêu affected items, rationale, gaps/freshness và effect;
  Apply/Dismiss là typed action riêng, không suy ra từ prose.
- Nếu mode ambiguity làm thay đổi material answer, hỏi ngắn gọn và vẫn trả phần invariant.

**Product acceptance:** zero pending/hypothetical change xuất hiện như committed plan; zero
committed Trip state bị conversation fact silently override.

**Architecture/Eval follow-up:** mode classifier, planning snapshot, turn-intent digest,
proposal reference/fences và mode-specific fixtures.

#### PCR-09 — Chat deletion, Trip deletion và durable plan ownership

**Proposed PRD behavior:**

- Xóa ordinary/unscoped chat xóa transcript/context dẫn xuất thuộc chat đó.
- Xóa primary conversation không được vô tình xóa confirmed Trip plan; cần owner-scoped
  replacement hoặc explicit Trip delete theo contract hiện hành.
- Xóa Trip Project loại bỏ structured plan, proposals, derived retrieval snapshots và
  Trip-owned retrievable context khỏi normal use.
- Retained non-content audit không được tái dựng plan/question đã xóa.

**Product acceptance:** deletion behavior dễ hiểu cho traveler và được chứng minh end-to-end;
không orphan Trip, không stale retrieval snapshot, không cross-trip leakage.

**Architecture/Eval follow-up:** cascade/transaction policy, snapshot retention và deletion tests.

#### PCR-10 — Product success criteria cho trustworthy planning

PRD nên thêm outcome-level criteria, không đưa p95/cap/token mechanics vào product prose:

- Zero known hard-off-route factual contribution trong authoritative release cases.
- Zero unrelated evidence được dùng để satisfy required planning need.
- Zero hypothetical/pending proposal được trình bày như committed Trip state.
- Required need chưa cover luôn visible hoặc được chuyển thành bounded clarification.
- Web/live-data failure không tạo certainty giả và luôn có permitted recovery action.
- User correction chỉ thay durable plan sau explicit proposal confirmation, sau đó answer
  mới dùng version Trip đã cập nhật.

Numeric thresholds ngoài zero-tolerance safety outcome, cohort definition, p95 latency,
cost, cap và experiment uplift nằm trong versioned Architecture/Evaluation gate profile.

### Những nội dung không đưa vào PRD

- DTO/type names như `TripProjectPlanningSnapshotV6`, `CardFactUnitV6`, assertion IDs,
  hashes, projection generations hoặc reason-code union.
- PostgreSQL tables/indexes, worker queue keys, atomic activation, registry release mechanics.
- Candidate/token caps, stage timeouts, p95 numeric thresholds, AI batch size và retention hours.
- Model/provider choice, embedding/RRF/reranker implementation.
- Exact prompt/source render variants và replay serialization format.

PRD chỉ giữ capability, traveler behavior, ownership, confirmation boundary, failure behavior,
privacy/deletion outcome và acceptance result. Architecture/Eval artifacts sở hữu “how”.

## Production traveler journeys cần PRD bảo toàn

### PJ-01 — Từ câu hỏi riêng thành Trip Project bền vững

1. Traveler hỏi tự nhiên trong unscoped conversation.
2. Hệ thống trả useful answer trước, sau đó mới offer typed save/continue khi phù hợp.
3. Traveler explicit chọn save; hệ thống tạo Trip Project và primary conversation canonical.
4. Thông tin chưa confirmed chỉ thành proposal/draft, không tự biến thành plan item confirmed.
5. Lượt sau trong Trip scope đọc structured state đã apply, không reconstruct plan từ old chat.

### PJ-02 — Hỏi về kế hoạch hiện tại

1. Traveler mở Trip Project và hỏi “ngày thứ hai nên dừng ở đâu?”.
2. Server pin exact Trip aggregate/items và selected path hiện hành.
3. Retrieval chỉ chọn facts áp dụng cho relevant leg/need.
4. Answer nói rõ suggestion dựa trên plan hiện tại, surfaces gaps/freshness.
5. Nếu traveler muốn lưu stop, hệ thống tạo proposal và chờ Apply.

### PJ-03 — Khảo sát detour mà không phá kế hoạch

1. Traveler hỏi “nếu thêm Đà Lạt thì sao?”.
2. Hệ thống giữ current plan làm baseline và resolve Đà Lạt như hypothetical scope.
3. Retrieval so sánh route/facet impacts cho proposed path, không gọi đó là current route.
4. Traveler có thể yêu cầu tạo proposal; dismiss/close không đổi Trip.
5. Chỉ Apply thành công mới tăng aggregate version và làm path mới thành current context.

### PJ-04 — Route mơ hồ hoặc ngoài coverage

1. Traveler nêu OD nhưng không chọn material alternative, hoặc route ngoài supported registry.
2. Hệ thống trả phần place/general/invariant guidance vẫn an toàn.
3. Nó trình bày bounded alternatives hoặc hỏi một câu làm rõ đúng decision.
4. Nó nói scope limitation và điều cần kiểm tra, không bịa end-to-end applicability.

### PJ-05 — Required need thiếu evidence hoặc runtime bị giới hạn

1. Traveler cần route, nghỉ và EV charging nhưng evidence chỉ cover route/nghỉ.
2. Answer ưu tiên required safety/vehicle needs trong evidence budget.
3. EV gap được surfaced với web verification/clarification/recovery phù hợp.
4. Optional inspiration bị bỏ trước; unrelated food card không lấp EV need.

### PJ-06 — Thông tin thay đổi ngoài đời

1. Traveler hỏi cảnh báo đường gần đây.
2. Internal knowledge chỉ đóng vai trò grounded context theo policy; web/provider result
   phải resolve geography/time và vẫn mang external verification boundary.
3. Answer phân biệt warning được ghi nhận với live closure/open status.
4. Provider failure tạo safe limitation và action kiểm tra, không tạo route certainty.

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
Traveler question + canonical URL-selected server scope
  -> classify retrieval planning mode
  -> load exact committed TripProjectPlanningSnapshot when scoped
  -> parse bounded CurrentTurnIntent / ProposalEvaluationContext
  -> deterministic context boundary (committed != proposed)
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

18. **Trip Project owns durable planning truth.** Anchors, legs, activities, constraints,
selected/confirmed paths, alternatives và applied changes chỉ authoritative khi thuộc exact
owner-scoped Trip aggregate/version.

19. **Chat is command surface, not a competing memory.** Transcript và `chat_context`
không silently override, duplicate hoặc become fallback writer cho structured Trip state.

20. **Proposed is not committed.** Current-turn hypothetical scope và pending proposal
có thể mở candidate scope cho exploration/validation mode, nhưng answer phải phân biệt rõ
“kế hoạch hiện tại” với “phương án đang xem xét” và không persist nó như plan state.

21. **Mode is replayable.** Mọi execution pin planning mode, committed Trip snapshot,
turn-intent digest, proposal reference/version khi có và reason quyết định mode.

22. **Real-user degradation is explicit.** Ambiguous/partial/outside-coverage route,
unresolved required need, provider failure hoặc budget cap phải tạo bounded useful answer,
limitation và next action; không silent omission hoặc unrelated evidence substitution.

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

- Owns Trip Project aggregate: anchors, legs, activities, constraints, alternatives,
  selected/confirmed path choice, primary conversation, proposals và change history.
- Là single writer cho mọi committed plan mutation qua owner-confirmed command.
- Cung cấp immutable typed `TripProjectPlanningSnapshotV6`; không mutate retrieval
  reference data và không cho Retrieval đọc trực tiếp raw planning tables.
- Owns typed proposal lifecycle. Pending/dismissed/expired proposal không đổi committed snapshot.

### AI Orchestration

- Owns stage orchestration, model calls, timeouts, usage events và final answer provenance.
- Có thể parse bounded current-turn intent và draft schema-validated proposal.
- Không sửa policy, canonical scope hoặc committed Trip state; không biến provider/model
  output thành proposal đã apply.

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
| Trip Project structured aggregate | Chat/Trips | Chỉ owner-confirmed command áp dụng persistent plan change |
| `TripProjectPlanningSnapshotV6` | Chat/Trips | Immutable exact aggregate/item/version projection cho một execution |
| `CurrentTurnIntentV6` | AI Orchestration qua validated parser | Ephemeral, bounded, không phải Trip writer/source of truth |
| Trip Change Proposal | Chat/Trips | Typed draft/lifecycle; chỉ apply command mới đổi Trip aggregate |

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
  planningMode: RetrievalPlanningModeV6;
  tripPlanningSnapshotId: string | null;
  tripAggregateVersion: number | null;
  currentTurnIntentHash: string;
  proposalReference: null | {
    proposalId: string;
    proposalRevision: number;
    status: "pending";
  };
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
  Trip planning snapshot, current-turn intent và proposal reference đủ để replay.
- User-derived execution state phải có retention/deletion propagation theo chat/Trip
  ownership contract; deletion không để lại payload có thể tái dựng user question/context.
- Candidate caps, ordering config, batch sizes, timeouts, web bounds và diagnostic
  retention luôn đến từ pinned runtime policy; không hard-code khác nhau trong
  independently-built stages.

## Shared contracts

### Trip planning authority và retrieval mode

~~~ts
type RetrievalPlanningModeV6 =
  | "current_plan"
  | "explore_change"
  | "validate_proposal"
  | "unscoped_answer";

type TripProjectPlanningSnapshotV6 = {
  snapshotId: string;
  tripProjectId: string;
  ownerId: string;
  aggregateVersion: number;
  primaryConversationId: string;
  registrySnapshotId: string | null;
  anchors: Array<{
    itemId: string;
    itemVersion: number;
    role: "origin" | "destination" | "region" | "required_stop" | "accommodation";
    state: "idea" | "planned" | "confirmed" | "backup";
    canonicalLocationId?: string;
    boundedLabel: string;
  }>;
  legs: Array<{
    itemId: string;
    itemVersion: number;
    state: "idea" | "planned" | "confirmed" | "backup";
    originLocationId?: string;
    destinationLocationId?: string;
    selectedPathId?: string;
    pathRegistrySnapshotId?: string;
  }>;
  constraints: TypedTravelConstraints;
  constraintsVersion: number;
  serializedStateHash: string;
  createdAt: string;
};

type CurrentTurnIntentV6 = {
  intentId: string;
  conversationId: string;
  sourceMessageId: string;
  normalizedMessageHash: string;
  modeSignals: Array<
    | "asks_about_current_plan"
    | "proposes_change"
    | "asks_hypothetical"
    | "asks_to_validate_pending_proposal"
    | "asks_unscoped"
  >;
  proposedScope?: {
    originLocationId?: string;
    destinationLocationId?: string;
    pathId?: string;
    addedStopLocationIds: string[];
    removedStopLocationIds: string[];
  };
  transientConstraints?: TypedTravelConstraints;
  unresolvedPhrases: string[];
  parsingMethod: "deterministic" | "ai_assisted_validated";
};

type ProposalEvaluationContextV6 = {
  proposalId: string;
  proposalRevision: number;
  proposalStatus: "pending";
  expectedTripAggregateVersion: number;
  affectedItemVersions: Array<{
    itemId: string;
    expectedVersion: number;
  }>;
  boundedOperationsHash: string;
};
~~~

Mode rules:

| Mode | Durable authority | Scope dùng cho retrieval | Traveler-facing outcome |
|---|---|---|---|
| `current_plan` | Exact committed Trip snapshot | Confirmed/planned Trip scope theo product rule | Mô tả rõ đây là kế hoạch hiện tại |
| `explore_change` | Trip snapshot chỉ làm baseline; turn intent là hypothetical | Bounded proposed route/place/constraints được explicit nêu | So sánh hiện tại với phương án; không nói proposal đã áp dụng |
| `validate_proposal` | Exact Trip snapshot + exact pending proposal/fences | Chỉ operations/scope được proposal xác định | Nêu ảnh hưởng, gap, verification need; cung cấp action review/apply riêng |
| `unscoped_answer` | Không có Trip plan authority | Chỉ current-turn explicit scope | Trả lời riêng; không load/persist Trip constraints |

Deterministic mode selection:

1. Server xác nhận canonical URL scope và owner/primary conversation trước khi load Trip.
2. Explicit request review một pending proposal hợp lệ chọn `validate_proposal`.
3. Explicit hypothetical/change language hoặc proposed scope khác committed plan chọn
   `explore_change`.
4. Trip-scoped question còn lại chọn `current_plan`.
5. Không có valid Trip scope chọn `unscoped_answer`; server không tự attach project.
6. Khi nhiều signal xung đột và chúng làm thay đổi geographic result, hỏi một concise
   clarification nhưng vẫn trả phần guidance không phụ thuộc lựa chọn nếu an toàn.

Authority rules:

- `TripProjectPlanningSnapshotV6` là read projection, không phải aggregate/truth mới.
- `CurrentTurnIntentV6` không persist như durable traveler memory. Bounded diagnostic
  representation tuân thủ retention/deletion của message và không được reuse qua turn
  như confirmed plan.
- Pending proposal được dùng trong `validate_proposal` hoặc explicit exploration;
  nó không đổi `current_plan` query context và không satisfy confirmed planning need.
- Nếu user muốn sửa persistent plan, answer có thể kèm typed proposal action qua owner
  boundary. Retrieval completion không đồng nghĩa proposal creation/application thành công.
- Apply proposal làm aggregate version tăng; execution đang chạy trên old version bị
  fence/discard theo AI Ask terminalization contract, không merge state.
- Conversation-local pronoun/reference resolution có thể giúp hiểu “phương án thứ hai”,
  nhưng resolved reference phải dẫn tới exact current answer/proposal/Trip item; raw
  transcript không được trở thành route/constraint authority.

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
- Sensitive data ngoài Trip Planning privacy contract hiện hữu không được thêm vào constraint.
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
  planningMode: RetrievalPlanningModeV6;
  tripPlanningSnapshotRef: null | {
    snapshotId: string;
    tripProjectId: string;
    aggregateVersion: number;
    serializedStateHash: string;
  };
  currentTurnIntentRef: {
    intentId: string;
    sourceMessageId: string;
    normalizedMessageHash: string;
  };
  proposalEvaluationRef: null | {
    proposalId: string;
    proposalRevision: number;
    expectedTripAggregateVersion: number;
  };
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
- Trong `current_plan`, chỉ exact structured Trip snapshot cấp planning authority;
  transcript/`chat_context` không tham gia precedence hoặc silently override.
- Trong `explore_change`, proposed scope/constraints chỉ áp dụng cho requirement keys được
  current turn xác định và phải mang `hypothetical` contribution status; committed Trip
  scope vẫn được giữ để so sánh, không bị overwrite.
- Trong `validate_proposal`, proposal reference phải pending/current và version fences phải
  khớp snapshot. Mismatch fail closed thành refresh/review lại, không dùng proposal stale.
- Trong `unscoped_answer`, `tripPlanningSnapshotRef` và `proposalEvaluationRef` phải null;
  không load selected Trip constraints từ browser/local history.
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
- Initial production registry cấm duplicate `(pathId, locationId)` và `(pathId, segmentId)` trong
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
5. Resolve entities against exact validated `TripProjectPlanningSnapshotV6` anchors trước
   global aliases; trong exploration, proposed entities giữ label hypothetical riêng.
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
- bounded committed Trip snapshot anchors/legs/constraints khi scoped;
- bounded current-turn hypothetical/proposal operations theo planning mode;
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
  | "planning_mode_current_plan"
  | "planning_mode_explore_change"
  | "planning_mode_validate_proposal"
  | "planning_mode_unscoped_answer"
  | "planning_mode_ambiguous"
  | "trip_snapshot_stale"
  | "hypothetical_scope_only"
  | "proposal_reference_stale"
  | "outside_supported_coverage"
  | "required_gap_exposed"
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
- Same-turn source handles chỉ được issue cho exact manifest items/variants thực sự render.
  Answer model chỉ được report handle trong same-turn ledger; Orchestration validate report
  là subset của ledger trước terminal persistence.
- `citedInAnswer` tiếp tục là persisted answer-use fact riêng với `usedInPrompt`: một item
  có thể được render nhưng không cited, và không module nào suy citation từ answer prose.
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
| Prompt budget insufficient | Ưu tiên required need; trả useful partial answer + explicit limitation/next action |
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
- current-plan vs explore-change for the same Trip;
- pending/applied/dismissed/expired/stale proposal;
- private/unscoped answer with no Trip leakage;
- no-path/partial/ambiguous/outside supported coverage traveler outcomes;
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
  planningMode: RetrievalPlanningModeV6;
  tripPlanningSnapshotId: string | null;
  tripProjectId: string | null;
  aggregateVersion: number | null;
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
  currentTurnIntent: CurrentTurnIntentV6;
  proposalEvaluationContext: ProposalEvaluationContextV6 | null;
  expectedTravelerOutcome:
    | "current_plan_guidance"
    | "hypothetical_comparison"
    | "proposal_review"
    | "unscoped_private_answer"
    | "bounded_partial_with_limitation"
    | "clarification_with_invariant_guidance";
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
rendered route-scope-applicable atomic contributions
/
all rendered route-scoped internal atomic contributions
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
- Every `citedInAnswer` handle is a same-turn rendered handle.
- `usedInPrompt` and `citedInAnswer` remain independently correct.

#### Trip planning mode correctness

~~~text
cases with correct planning mode and committed/proposed labeling
/
all Trip/unscoped mode-labeled cases
~~~

Report separately:

- hypothetical/pending-as-committed error rate (target zero);
- stale proposal accepted-as-current rate (target zero);
- private/unscoped Trip-context leakage rate (target zero);
- current-plan snapshot exact-version accuracy;
- useful partial-answer rate when route/evidence is incomplete;
- silent required-gap omission rate (target zero).

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
    minimumPlanningModeAccuracy: number;
    maximumHypotheticalAsCommittedRate: number;
    maximumPrivateTripContextLeakageRate: number;
    maximumSilentRequiredGapOmissionRate: number;
    minimumUsefulPartialAnswerRate: number;
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
- planning-mode deterministic classification and ambiguous-mode fallback.
- current-plan vs hypothetical/proposal contribution labeling.
- pending/applied/dismissed/expired proposal truth table.
- Trip snapshot/turn-intent/proposal version-fence validation.
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
- Chat/Trips snapshot adapter against exact aggregate/item versions.
- current-plan/explore-change/validate-proposal/private-answer end-to-end separation.
- proposal apply changes later retrieval context; dismiss/expire does not.
- primary-conversation replacement and Trip/chat deletion invalidation.
- final provenance persistence.
- evaluation harness against real index/config/query.

Mỗi integration suite cần clean tables phải tự gọi `resetTestDatabase()`. Suite giữ serial trên một physical test database.

## Telemetry reason codes

### Planning context

- `planning_mode_current_plan`
- `planning_mode_explore_change`
- `planning_mode_validate_proposal`
- `planning_mode_unscoped_answer`
- `planning_mode_ambiguous`
- `trip_snapshot_stale`
- `hypothetical_scope_only`
- `proposal_reference_stale`
- `outside_supported_coverage`
- `required_gap_exposed`

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

### Bước P0: PRD và Architecture rebaseline

Mục tiêu: biến v6.2 thành approved product/architecture contract trước khi tạo story.

PRD work:

- Giữ nguyên `PBF-01..05`; không mở lại Trip Project ownership/confirmation model.
- Product review từng `PCR-01..10`: approve, revise hoặc defer với owner/revisit condition.
- Update relevant vision/principles, FR-11..16L, FR-29..35, Trip Planning Foundation
  contract, success criteria, acceptance criteria, risks và non-goals.
- Thay mọi wording khiến `chat_context` có thể bị hiểu như alternative structured Trip plan.
- Thêm production journeys `PJ-01..06` ở outcome level hoặc trace chúng vào FR/AC.
- Ghi rõ supported geography, live-data boundary, partial-answer behavior và proposal modes.
- Không đưa DTO/table/algorithm/numeric gate profile vào PRD.

Architecture work sau PRD approval:

- Update AD-29/30 integration với retrieval planning modes và Trip planning snapshot.
- Ratify canonical Trip path schema/operations/migration hoặc explicitly disable
  `confirmed_trip_path` authority cho đến tranche sau.
- Update AD-17/AD-9 cho sparse requirements, caveat exclusion và web geographic premise.
- Preserve same-turn rendered-handle/`citedInAnswer` contract khi thêm render manifest.
- Define replay, retention/deletion, proposal fencing, projection generations và numeric gates.

Acceptance:

- Mỗi `PCR-*` có disposition và target PRD section/FR/AC.
- PRD không mâu thuẫn Epic 16/Trip Planning Foundation.
- Architecture trace được từ mỗi approved product behavior tới owning module/decision.
- Superseded roadmap/spec references được mark hoặc remove theo documentation currency rule.

Gate:

- Không bắt đầu production implementation Bước 1–12 khi P0 chưa pass
  `bmad-check-implementation-readiness` cùng epics/stories mới.

### Bước 0: Evaluation-first baseline và immediate leakage isolation

Mục tiêu: có ground truth trước khi thay thuật toán, đồng thời sửa lỗi source metadata rõ ràng.

Công việc:

- Tạo evaluation schema/dataset v6 với must-include/must-exclude/must-render/must-not-render.
- Tạo immutable CorpusFixtureManifest và typed TripContext fixtures.
- Thêm production journeys/mode fixtures cho current plan, hypothetical detour, pending/
  applied/stale proposal, private answer, outside coverage và partial required coverage.
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
- Không enable Trip-scoped production read nếu planning-mode/Trip-authority zero-tolerance
  fixtures chưa pass.

### Bước 1: Shared query/facet contracts

Mục tiêu: mọi module dùng cùng vocabulary và typed query scope.

Công việc:

- Thêm shared `TravelFacet`, `TravelQueryPlanV6`, typed constraints và validation.
- Thêm `RetrievalPlanningModeV6`, `TripProjectPlanningSnapshotV6`, `CurrentTurnIntentV6`
  và proposal evaluation refs theo approved Architecture contract.
- Thêm versioned `IntentRequirementProfileV6`, `ConstraintRefV6` và canonical
  constraint-key derivation.
- Implement typed executable expansion-rule evaluator và golden query-plan -> exact
  requirement-key vectors, gồm repeated OD legs/comparison/constraint target cases.
- Thêm path-authority matrix; explicit/confirmed choices tách khỏi style/free-text inference.
- Version card type -> facet mapping.
- Implement deterministic Vietnamese entity/facet parser baseline.
- Load allowlisted Trip Project anchors/legs/constraints từ exact Chat/Trips-owned snapshot;
  không load plan authority từ transcript/`chat_context`.
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
- Current-plan/explore-change/validate-proposal/unscoped modes tạo query-plan khác nhau,
  replayable và không cross-authorize.

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
- Implement approved Trips-owned canonical refs/proposal operations; cho đến khi complete,
  current free-text labels và pending proposal không cấp confirmed path authority.
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

### Bước 12: Trip-aware planning context và proposal-safe retrieval

Mục tiêu: làm retrieval tuân thủ Epic 16/AD-29 cho người dùng thật. Trip Project là
confirmed planning source; chat là command/proposal surface. Không tạo generic traveler
memory aggregate hoặc framework mới.

Prerequisite product decisions:

- `PCR-05`, `PCR-08` và `PCR-09` được đưa vào PRD với ownership/failure behavior rõ.
- Architecture update ratify Trip-owned canonical path representation, proposal operations,
  snapshot adapter và deletion/fencing contract.
- Current Trip Planning schema/implementation được inventory; không giả định field đã tồn tại.

Workstream 12A — Trip planning snapshot adapter:

- Chat/Trips export `TripProjectPlanningSnapshotV6` từ exact aggregate version.
- Snapshot chỉ gồm allowlisted fields cần cho retrieval: canonical anchors, relevant legs,
  item states, selected path refs và typed constraints.
- Mỗi item/ref pin exact owner ID/version; snapshot serialization deterministic và bounded.
- Snapshot generation không ghi table/aggregate mới và không reconstruct state từ transcript.
- `confirmed`, `planned`, `idea`, `backup` giữ đúng product semantics; `confirmed` không
  tự mang nghĩa live route/provider verified.

Workstream 12B — Current-turn intent:

- Parse exact current message thành bounded `CurrentTurnIntentV6`.
- Intent có thể mô tả hypothetical path/stop/constraint để tìm evidence cho exploration,
  nhưng không được ghi vào Trip snapshot hoặc reuse như confirmed state ở later turn.
- Conversation reference như “phương án thứ hai” phải resolve đến exact stored answer/
  proposal/Trip item; unresolved reference tạo clarification, không suy đoán.
- Sensitive/unallowlisted fields bị reject trước model/search; external query được minimize.

Workstream 12C — Planning mode classifier:

- Deterministic signals chọn `current_plan`, `explore_change`, `validate_proposal` hoặc
  `unscoped_answer`; AI chỉ hỗ trợ bounded ambiguity và server validate output.
- Mode decision pin source message, Trip snapshot, proposal ref và reason codes.
- Current-plan mode không đọc pending proposal như applied context.
- Explore mode giữ current plan làm baseline và chỉ mở proposed scope cho requirement
  edges mang hypothetical status.
- Validate-proposal mode re-check pending status, expected aggregate/item versions và expiry.
- Unscoped/private mode không load hoặc persist Trip constraints.

Workstream 12D — Proposal handoff:

- Retrieval output có thể cung cấp evidence/gaps cho AI draft proposal nhưng không trực
  tiếp tạo/apply mutation ngoài approved Chat/Trips command.
- Proposed operation chỉ reference exact Trip items/canonical locations/path IDs được validate.
- Proposal render cho traveler phân biệt current state, proposed effect, rationale,
  alternatives, missing/fresh details và Apply/Dismiss actions.
- Apply thành công tạo aggregate version mới; old in-flight answer/proposal bị version fence.
- Dismiss/expire không đổi Trip plan và không làm proposal scope xuất hiện trong later query.

Workstream 12E — Correction semantics:

Không dùng precedence `selected_trip > current_conversation`. Một câu chat mâu thuẫn với
Trip state được classify:

| User expression | Mode/handling | Durable effect |
|---|---|---|
| “Kế hoạch hiện tại của tôi đi đâu?” | `current_plan` | Không |
| “Nếu thêm Đà Lạt thì sao?” | `explore_change` | Không, trừ khi later Apply proposal |
| “Đổi điểm đến thành Đà Lạt” | Draft typed proposal | Chưa đổi trước Apply |
| “Đà Lạt, không phải Nha Trang” trong proposal review | Refresh/replace proposal candidate | Không silently overwrite |
| Apply typed proposal hợp lệ | Chat/Trips command | Có, atomic/versioned |
| Chat fact khác Trip nhưng intent không rõ | Clarify + invariant guidance | Không |

Workstream 12F — Deletion/invalidation:

- Ordinary conversation deletion xóa transcript/context/intent diagnostics thuộc owner.
- Primary conversation deletion tuân thủ replacement-or-Trip-delete contract; không orphan
  live Trip Project hoặc xóa plan qua một implicit cascade ngoài PRD.
- Trip deletion invalidates planning snapshots, retrieval runs, query-plan payloads và
  shadow/evaluation artifacts có thể reconstruct Trip content.
- Proposal/aggregate/conversation mismatch fail closed; stale snapshot không reuse.
- Retention policy cho diagnostic hashes/payloads được pin; retained non-content audit
  không tái dựng question/plan.

Metrics:

- planning-mode classification accuracy;
- current-plan state accuracy against exact aggregate version;
- hypothetical-as-committed error rate;
- pending-proposal-as-applied error rate;
- proposal impact coverage và stale-proposal rejection;
- correction-to-proposal accuracy;
- unscoped/private Trip-context leakage rate;
- follow-up continuity within one Trip;
- deletion/invalidation compliance;
- Trip-context-induced route/facet error rate;
- user-visible clarification rate và useful-partial-answer rate.

Fixtures tối thiểu:

- current Trip Hà Nội–Huế–Đà Nẵng, user asks current-plan stop advice;
- same Trip, user hypothetically adds Đà Lạt;
- user asks to replace destination, proposal remains pending;
- proposal applied then immediate follow-up pins new aggregate version;
- proposal stale because a different plan edit committed first;
- pending/dismissed/expired proposal must not affect current-plan retrieval;
- explicit current-turn canonical path choice used only for that exploration unless applied;
- current message conflicts with confirmed path but has ambiguous intent;
- primary conversation deletion replacement flow;
- ordinary chat deletion does not mutate unrelated Trip plan;
- Trip deletion invalidates all derived retrieval context;
- private/unscoped answer must not load selected Trip constraints;
- cross-owner/cross-trip proposal and snapshot references fail closed;
- sensitive/unallowlisted current-turn field rejection.

Acceptance:

- Zero transcript/`chat_context` field được dùng như alternative itinerary writer.
- Zero hypothetical/pending/dismissed/expired proposal được render như committed Trip state.
- Every Trip-scoped run pins exact aggregate/item/path registry versions và is replayable.
- Current-plan vs exploration outputs khác nhau đúng theo fixtures và traveler copy.
- Apply is the only transition that changes later Trip retrieval context.
- Deletion integration tests chứng minh owner content và derived reconstructable state biến mất.
- Mode/scope/required-coverage metrics meet pinned gate profile; zero-tolerance cohorts pass.
- Không thêm Mem0/Zep/LangMem hoặc memory table nếu Trip snapshot + turn intent đáp ứng contract.

Gate trước implementation:

- PRD change ledger decisions approved; Architecture Spine updated; Trip schema gap inventory complete.
- Adapter lossless fixtures pass với current aggregate trước migration.
- Canonical path migration/proposal behavior có rollback và stale-reference recovery.
- Nếu product không approve durable canonical path trong tranche, `confirmed_trip_path`
  authorization phải bị disable; roadmap không fallback sang free-text/chat authority.

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
- Zero current-turn hypothetical/pending proposal được classify như committed Trip scope.
- Zero `chat_context`/transcript value cấp hard path/constraint authority cho current plan.
- Outside-coverage/no-path/partial/ambiguous cohorts có đúng bounded traveler outcome.

### Facet quality gate

- Required requirement-key coverage meets pinned gate profile by cohort.
- Missing facets produce explicit gap behavior.
- Final-set precision does not regress.
- Required need bị cap/thiếu luôn surfaced; unrelated contribution satisfaction rate = 0.

### Safety/provenance gate

- Only active evidence-eligible cards used.
- Operator-required/caveat-only code states are excluded from internal retrieval and
  represented only as gap/web-verification triggers.
- Rendered-only provenance is exact.
- Source removal/stale projection fail closed.
- Web premises pin exact immutable scope projection and query-specific decision.
- Pending/dismissed/expired proposal không xuất hiện như applied plan.
- Live warning copy không biến external/recent evidence thành authoritative closure status.
- Private/unscoped answer không load, render hoặc persist Trip constraints.

### Operational gate

- p95 stage/total latency within AI Ask budget.
- AI/web call rate and cost bounded.
- Index/backfill/Worker fencing/retry behavior demonstrated.
- Per-requirement cap ordering/replay deterministic; cap-excluded must-include rate meets
  pinned cohort threshold.
- No new deployment component required.
- Trip aggregate/proposal version fencing, deletion invalidation và stale-snapshot recovery pass.

### Product/Trip planning gate

- PRD `PCR-01..10` dispositions và Architecture trace được approve/versioned.
- Current-plan answer pins exact Trip aggregate/item/path registry versions.
- Explore-change answer giữ current plan làm baseline và labels proposed effects.
- Apply proposal là transition duy nhất làm later retrieval dùng changed Trip state.
- Primary conversation deletion/replacement và Trip deletion behavior pass end-to-end.
- Traveler copy cho partial/ambiguous/outside coverage, missing required need và provider
  failure được Product/UX approve bằng Vietnamese fixtures.

## Deferred decisions

### Full GIS hoặc dynamic route provider

Không build trong retrieval roadmap. Static product-domain registry chỉ xác lập applicability cho supported planning knowledge; nó không đại diện live navigation.

### Automatic near-route

Không dùng radius/distance inference. Một place chỉ `planned_stop_local` khi traveler/Trip Project chọn stop hoặc registry có explicit reviewed membership.

### RRF

Không mặc định dùng. Chỉ chọn sau ablation chứng minh multiple retrievers bổ sung nhau và RRF tốt hơn simpler union/normalized fusion.

### ColBERT/late interaction/cross-encoder

Không deploy cho initial production corpus nếu chưa có measured precision/recall gap và operational justification.

### GraphRAG

Route registry là deterministic reference model, không phải semantic knowledge graph. Không build GraphRAG trong v6.2.

### Autonomous tool calling

Answer model không tự gọi retrieval/search. Server-controlled stages giữ policy, budget và provenance.

### External traveler-memory framework

Không thêm Mem0, Zep hoặc LangMem trước measured failure của Trip Project planning snapshot,
current-turn intent và proposal-reference model. Framework ngoài không được trở thành
planning source of truth hoặc bypass Chat/Trips proposal commands.

### Automatic decay

Không suppress card theo age hoặc embedding similarity. Freshness policy, verification workflow và explicit evidence lifecycle vẫn là authority.

## Thứ tự triển khai tóm tắt

~~~text
P0. PRD + Architecture rebaseline from PCR/PJ ledger
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
12. Trip-aware planning context + proposal-safe retrieval
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
- Trip Project là durable planning authority; chat chỉ là command/proposal surface.
- Current-plan, exploration, proposal-validation và unscoped modes được phân biệt/replay.
- Hypothetical/pending proposal không silently thay committed context.
- Canonical Trip path chỉ authoritative sau approved owner-confirmed persistent transition.
- Partial/ambiguous/outside-coverage và runtime-cap failures có useful bounded behavior.
- PRD change ledger được disposition đầy đủ và Architecture/epic/story trace không mâu thuẫn.
- Privacy/deletion loại bỏ derived reconstructable Trip/chat state theo owner contract.

## Tham chiếu

- V5 superseded: `docs/roadmaps/retrieval-va-tri-nho-traveler-v5.md`
- V6 superseded by this revision when approved: `docs/roadmaps/retrieval-va-tri-nho-traveler-v6.md`
- V6.1 superseded by this revision when approved: `docs/roadmaps/retrieval-va-tri-nho-traveler-v6.1.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- Architecture Spine: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- Epic 16: `_bmad-output/planning-artifacts/epics.md#Epic-16-Chat-First-Trip-Companion-Simplification`
- Trip Project product direction: `docs/proposals/trip-project-product-direction.md`
- Community Knowledge Solution Design: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md`
- Current retrieval: `packages/database/src/knowledge-search.ts`
- Current source bundle: `packages/database/src/source-bundle.ts`
- PostgreSQL full-text search: https://www.postgresql.org/docs/current/textsearch-controls.html
- PostgreSQL text-search weighting: https://www.postgresql.org/docs/current/textsearch-features.html
- PostgreSQL `unaccent`: https://www.postgresql.org/docs/current/unaccent.html
- PostgreSQL `pg_trgm`: https://www.postgresql.org/docs/current/pgtrgm.html
- Reciprocal Rank Fusion: https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/
- ColBERTv2: https://arxiv.org/abs/2112.01488
