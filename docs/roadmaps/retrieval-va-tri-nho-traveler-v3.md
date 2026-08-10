# Lộ trình cải tiến Retrieval & Trí nhớ Traveler — Phiên bản 3

## Trạng thái

Đề xuất ngày 2026-08-09, cập nhật từ v2 (`docs/roadmaps/retrieval-va-tri-nho-traveler-v2.md`) sau review kỹ thuật. Đây là lộ trình định hướng, không phải build plan đã được phê duyệt. Mỗi nhóm thay đổi lớn cần PRD và architecture riêng trước khi triển khai.

**Baseline hiện tại (2026-08-09):**

- Retrieval dùng `ILIKE` pattern matching trên `knowledge_card_search_documents`, scoring theo term count (+2/+1), sort phụ theo freshness.
- Search layer có thể lấy nhiều ứng viên, nhưng source-bundle assembly hiện target 3 knowledge cards (`approvedKnowledgeTargetCount = 3`).
- Source bundle prompt budget 5,000 chars (`maxSourceBundleSectionLength`) với progressive degradation (compact -> minimal -> essential).
- Chat history budget 12,000 chars / 10 messages (`maxPromptHistoryCharacters` / `maxPromptHistoryMessages`).
- Tổng prompt input hiện tại khoảng 20,500 chars, xấp xỉ 6,700 tokens theo quy đổi thận trọng; tức vẫn rất nhỏ so với context window 1M tokens (<1% nếu so trực tiếp theo token window).
- Retrieval timeout hiện tại 1.5s per task (parallel fetch).
- Provenance tracking đầy đủ qua `assistant_response_provenance` và `assistant_retrieval_decisions`.
- Policy enforcement per-card (`contextual_use`, `caveat_only`, `exclude`) xảy ra trước khi data vào prompt.
- Web search fallback khi knowledge thiếu, stale, hoặc freshness-sensitive.
- Corridor seed target: 100 active evidence-grounded cards.
- YouTube discovery proposal đã soạn, chưa triển khai.

## Quyết định kiến trúc

### Giữ nguyên từ v1/v2

- `knowledge_cards` là kho kiến thức duy nhất, evidence-grounded, source-linked.
- `chat_context` và trip-project context là kho trí nhớ traveler duy nhất.
- Search index, full-text vectors, và embeddings là derived retrieval indexes, không phải source of truth.
- Mọi câu trả lời phải preserve provenance tới knowledge cards, sources, traveler-memory facts, và web-search data.
- Không dùng Mem0, Zep, LangMem cho đến khi hệ thống hiện tại chứng minh thiếu sót cụ thể.
- Không xây GraphRAG. Travel knowledge hiện không cần multi-hop graph reasoning; metadata filtering (`type`, `locationName`, `routeSegment`, `tags`, `conditions`) đã đóng vai trò relationship layer dạng relational.

### Quyết định mới trong v3

1. **Evaluation đi trước complexity** — mọi bước sau FTS phải có baseline đo recall, ranking, type coverage, facet miss rate, latency, và prompt utilization.

2. **Prompt budget tăng có kiểm soát** — 5,000 chars là bottleneck nhân tạo, nhưng tăng budget phải đi kèm kiểm tra selected-card target, compact thresholds, cost, prompt injection surface, và lost-in-the-middle risk.

3. **Query decomposition là bước bắt buộc cho broad planning** — câu hỏi rộng cần phân tách thành sub-queries và merge results thay vì single-shot search.

4. **Type-diversity selection là bắt buộc khi corpus lớn** — khi có nhiều cards liên quan đến cùng route/topic, final set phải chọn theo facet/type budget thay vì chỉ top-K relevance.

5. **Contextual compression bắt đầu deterministic-first** — phase 1 chỉ dùng template/rule-based field and sentence selection. AI compression chỉ được xem xét sau evaluation và phải preserve source IDs/evidence IDs nguyên vẹn.

6. **Bounded Agent thay thế full Tool Calling** — khi corpus đạt 2,000+ cards và evaluation chứng minh facet miss rate cao, dùng server-controlled 2-step retrieval. Không cho AI quyền gọi tools tự do vì phá vỡ provenance tracking và policy enforcement.

7. **Topic Briefs là điều kiện scale, không phải mặc định build ngay** — chuẩn bị khi YouTube ramp-up tạo density cao hoặc broad-route evaluation cho thấy atomic cards không đủ prompt-efficient.

## Điểm yếu hiện tại và giải pháp

| # | Điểm yếu | Giải pháp | Bước |
|---|----------|-----------|------|
| 1 | `ILIKE` search miss các câu cùng ý khác từ | FTS -> Embeddings -> Hybrid RRF | 2, 3, 4 |
| 2 | Vietnamese diacritics/partial matching chưa tốt | Spike deployable Postgres FTS options | 2 |
| 3 | Scoring đơn giản (term count) | RRF fusion + diversity selection + reranker nếu cần | 4, 6, 8 |
| 4 | Final evidence set hiện target 3 cards | Dynamic 3-8 cards theo question type + source-bundle target update | 1.5, 5, 6 |
| 5 | Prompt size cap 5,000 chars trigger degradation sớm | Tăng 12K -> 20K -> 30K có A/B test và monitoring | 1.5, 7, 9 |
| 6 | Broad questions miss critical facets khi corpus lớn | Query decomposition + route-aware scoping + type-diversity | 5, 6 |
| 7 | Corpus density cao làm atomic cards không prompt-efficient | Topic briefs với supporting card IDs và stale rules | 7 |
| 8 | Follow-up questions có thể mất context/retrieval continuity | Memory relevance improvements + bounded refinement khi đủ điều kiện | 9, 10 |
| 9 | Retrieval timeout risk tăng theo complexity | Latency budget per stage + regression tests | Xuyên suốt |

## Target RAG Harness

Pipeline retrieval mục tiêu sau khi hoàn thành lộ trình:

```text
Câu hỏi traveler
  -> query decomposition (rule-based trước, AI-assisted chỉ khi cần)
  -> route-aware scoping (filter theo routeSegment/locationName khi rõ)
  -> broad hybrid candidate retrieval (FTS + vector, 20-50 candidates per sub-query)
  -> merge + deduplicate + RRF rank fusion
  -> type-diversity selection (type budget theo question category)
  -> deterministic contextual compression
  -> topic brief injection nếu có brief phù hợp
  -> [conditional] bounded agent refinement nếu coverage thiếu
  -> bounded evidence bundle cho answer model
  -> answer + persisted provenance
```

### Quy tắc Retrieval

- Chỉ search knowledge cards đạt policy-eligible: active, source-linked, evidence-grounded. Cards conflicted, failed-verification, stale, suppressed đều excluded.
- Candidate pool 20-50 trước khi chọn final set. Câu hỏi hẹp cần khoảng 3 cards; broad planning cần khoảng 5-8 cards.
- Final set chọn theo relevance, card type, route/location, confidence, freshness, source diversity, và type-diversity budget.
- Route-spanning questions phải có đại diện cho các facet quan trọng khi relevant: route, accommodation, warning, food, activity, kid-friendly, cost.
- Khi candidate pool lớn cho cùng route segment, ưu tiên freshness, confidence cao, và nhiều independent sources.
- Gemini-derived YouTube evidence là operator-only raw source, không phải retrieval input trực tiếp.
- Không pass raw source payload, transcript đầy đủ, provider payload, hoặc operator-only data vào traveler-facing AI Ask prompt.

## Tiến hóa Search

### Bước 1: Hoàn thiện Epic 4 hiện tại

Hoàn thành state-aware indexing, source bundles, answer policy, fallback/provenance, trust details, và retrieval safety checks.

### Bước 1.5: Tăng Prompt Budget Level 1

Tăng prompt budget là quick win, nhưng không chỉ là sửa constants. Bước này cần xác nhận toàn bộ source-bundle path vẫn preserve provenance và selected IDs chính xác.

**Thay đổi dự kiến:**

- `maxSourceBundleSectionLength`: 5,000 -> 12,000.
- `maxPromptHistoryMessages`: 10 -> 14.
- `maxPromptHistoryCharacters`: 12,000 -> 20,000.
- Compact mode: tăng từ 1 knowledge card / 2 web lên target khoảng 3 knowledge cards / 3 web nếu fit.
- Upstream source-bundle selection: kiểm tra `approvedKnowledgeTargetCount = 3`; nếu chưa chuyển dynamic target thì Level 1 chủ yếu giảm degradation, chưa tự động tăng evidence diversity.

**Acceptance cho Bước 1.5:**

- Narrow questions vẫn không bị nhồi nguồn thừa.
- Broad planning questions có thể giữ nhiều knowledge cards hơn trước khi compact/minimal.
- `assistant_response_provenance` vẫn chỉ ghi sources thật sự included trong prompt.
- Latency và input-token cost được đo trước/sau trên cùng test prompts.

### Bước 2: Full-text Search + Evaluation Baseline

Thêm PostgreSQL full-text search cho Vietnamese keyword/entity matching, nhưng chỉ chọn option deployable trong môi trường hiện tại.

**Spike options:**

- Option A: `unaccent` extension + `simple` config. Đây là baseline thực dụng, không stemming nhưng xử lý diacritics.
- Option B: investigate tokenizer/extension hỗ trợ Vietnamese có thể deploy được trong Postgres hiện tại. Reject nếu cần vận hành non-standard hoặc khó migrate.
- Option C: `pg_bigm` cho bigram/partial matching nếu extension có thể deploy an toàn.

**Evaluation framework bắt buộc trước bước 3:**

- Tạo curated test set 50-100 Vietnamese travel queries mapped tới expected relevant cards.
- Metrics: Recall@3, Recall@5, MRR, MAP.
- Baseline: đo metrics của `ILIKE` hiện tại trước khi chuyển sang FTS.
- Tạo mới script `pnpm test:retrieval` hoặc tích hợp retrieval eval vào Vitest project phù hợp. Nếu test cần PostgreSQL, nó thuộc `pnpm test:integration` và phải dùng `DATABASE_URL_TEST` theo rule hiện tại.

### Bước 3: Lifecycle-safe Embeddings

Thêm embeddings cho policy-eligible cards với reindexing khi card thay đổi, archived, suppressed, conflicted, hoặc mất eligibility.

**Decision gates:**

- Chỉ thêm provider/API embedding nếu PRD/architecture chấp nhận external dependency, cost, data handling, và retry/failure behavior.
- Không thêm local inference service nếu chưa có ownership triển khai/vận hành.
- Benchmark embedding model trên Vietnamese travel test set trước khi chọn.
- Candidates có thể gồm `multilingual-e5-large`, `bge-m3`, `Gemini text-embedding-004`, `voyage-3`, nhưng lựa chọn cuối phải dựa trên deployability, recall, latency, cost, và data-policy fit.
- Dimension/storage tradeoff phải được ghi trong architecture: 256/768/1024d, quantization nếu dùng.

### Bước 4: Hybrid Retrieval + RRF

Kết hợp FTS và vector similarity bằng Reciprocal Rank Fusion.

- RRF là parameter-light fusion, không cần training.
- Evaluate hybrid vs FTS-only vs vector-only trên cùng test set.
- Chỉ tiến sang bước 5 khi hybrid cải thiện measurable so với FTS-only hoặc chứng minh bổ sung coverage cho paraphrase queries.

### Bước 5: Query Decomposition

**Phase 1 — Rule-based decomposition:**

Phân tách broad planning questions thành 3-4 sub-queries, search parallel, merge + deduplicate results.

```text
Ví dụ: "Tư vấn lịch trình HN->HCM 2 tuần đi cùng 2 con nhỏ"
  -> "lịch trình Hà Nội TP.HCM road trip"      (route_note)
  -> "điểm dừng gia đình trẻ em"               (kid_friendly_tip, activity)
  -> "khách sạn gia đình tuyến Bắc Nam"        (hotel_area)
  -> "cảnh báo đường dài ô tô trẻ em"          (warning, route_note)
```

- Cost: 0 AI call.
- Provenance: server controls toàn bộ.
- Latency target: DB queries chạy parallel, phải đo trong retrieval eval.

**Phase 2 — AI-assisted decomposition:**

Chỉ dùng cheap/fast model để decompose complex questions khi rule-based đạt ceiling trên evaluation.

- Structured output: max sub-queries, allowed route/location/type hints.
- Server vẫn thực hiện search qua cùng policy pipeline.
- Không cho model chọn final sources trực tiếp.

### Bước 6: Route-aware Scoping + Type-diversity + Contextual Compression

**Route-aware scoping:**

Khi câu hỏi chứa route segment/location cụ thể, filter theo `routeSegment`/`locationName` trước hoặc trong ranking để giảm noise.

**Type-diversity selection:**

Khi có nhiều cards liên quan, chọn final set theo type budget thay vì chỉ top-K:

```text
Broad planning -> {route_note: 2, hotel_area: 1, warning: 1, food: 1, activity: 1, kid_friendly: 1, cost: 1}
Câu hỏi hẹp "khách sạn ĐN" -> {hotel_area: 3, cost_note: 2, place: 1, kid_friendly: 1}
```

**Deterministic contextual compression:**

- Giữ: title, type, location, confidence, policy, policyInstruction, source/evidence IDs.
- Compress summary bằng deterministic sentence/field selection theo query terms, route/location/type hints, và selected facet.
- Filter practicalDetails theo keys relevant.
- Trim evidence xuống quote relevant nhất nhưng không làm mất evidence/source identity.
- AI compression chỉ xem xét sau khi deterministic compression không đủ và phải có validation để không hallucinate hoặc rewrite provenance.

### Bước 7: Topic Briefs

Topic briefs là optimization cho recurring broad questions khi atomic-card density cao.

**Trigger:**

- Một corridor/topic đạt density cao (ví dụ >=500 cards sau YouTube ramp-up), hoặc
- Evaluation cho thấy broad-route prompts bị drop/miss facets vì quá nhiều atomic cards.

**Ví dụ:**

```text
"Huế -> Đà Nẵng: gia đình và điểm dừng"
  -> Tổng hợp từ 30 atomic cards: route_notes, kid_friendly_tips, parking, warnings
  -> 1 brief thay thế 30 cards trong prompt
  -> Brief giữ supporting card IDs và stale khi supporting cards thay đổi
```

**Quy tắc:**

- Child cards giữ nguyên atomic, source-linked evidence.
- Parent brief phải policy-eligible, không phải raw source.
- Brief stale khi supporting cards thay đổi, archived, hoặc mất eligibility.
- Chỉ tạo briefs cho route segments/topics có đủ density và evaluation support.

### Bước 8: Evaluation Checkpoint

Đo toàn bộ pipeline trước khi quyết định bounded agent, reranker, hoặc budget Level 3.

**Metrics:**

- Recall@5, Recall@8 trên test set mở rộng 100-200 queries.
- Type coverage: % broad questions có >=3 card types khác nhau trong final set.
- Facet miss rate: % broad questions thiếu critical facet khi relevant.
- Latency p50/p95/p99 cho retrieval pre-answer pipeline.
- Prompt utilization: trung bình bao nhiêu cards fit, bao nhiêu bị drop, degradation mode trigger rate.
- Provenance correctness: selected provenance IDs phải khớp nguồn thực sự included.

**Decision gates:**

- Nếu facet miss rate >20% cho broad questions và corpus >2,000 cards -> xem Bước 9.
- Nếu facet miss rate <=20% -> skip Bước 9, tiến sang Bước 10.
- Nếu latency p95 retrieval pre-answer >2s -> optimize trước khi thêm bounded refinement.
- Nếu answer quality giảm khi prompt lớn hơn -> ưu tiên compression/ordering trước khi tăng budget tiếp.

### Bước 9: Bounded Agent 2-step Retrieval

Chỉ triển khai khi Bước 8 cho thấy facet miss rate >20% cho broad questions và corpus >2,000 cards.

```text
Step 1 (server-controlled, parallel):
  - Decompose + search + merge + diversity select -> initial set (8-12 cards)

Step 2 (server-controlled, conditional):
  - Nếu initial set thiếu diversity (<3 relevant cards, hoặc 1 type chiếm >60%):
    - AI nhận initial results + question
    - AI trả về max 2 refinement_queries (structured output)
    - Server search refinement queries qua cùng policy pipeline
    - Merge với initial results -> final set
  - Nếu đủ coverage: dùng initial set
```

**Tại sao bounded agent thay vì full tool calling:**

| Aspect | Full Tool Calling | Bounded Agent |
|--------|-------------------|---------------|
| Max AI calls | Không giới hạn | 2: refinement + answer |
| Source selection | AI tự chọn/có thể drift | Server kiểm soát |
| Provenance | Dễ bị phá vỡ | Intact nếu server ghi selected IDs |
| Policy enforcement | AI có thể bypass card policy | Server enforce cùng pipeline |
| Latency/cost | Khó bound | Có upper bound rõ hơn |

Latency target ở roadmap này chỉ tính retrieval pre-answer. Final answer generation là ngân sách riêng. Bounded refinement p95 là mục tiêu cần đo với provider/model được chọn, không giả định trước.

### Bước 10: Cải tiến Trí nhớ Traveler

Cải thiện extraction quality, correction handling, deletion/user control, và relevance selection cho `chat_context` và trip-project context trước khi xem xét framework bên ngoài.

**Memory scopes:**

- Profile: durable preferences dùng xuyên chuyến, ví dụ xe, ăn uống, trẻ em, accessibility.
- Trip project: constraints của chuyến đang chọn, ví dụ ngày, route, budget, party composition.
- Conversation: temporary turn context.

**Memory evaluation:**

- Extraction accuracy: user nói constraint rõ thì fact được lưu đúng scope.
- Correction/supersession: fact cũ bị supersede, không cùng active với fact mới mâu thuẫn.
- Relevance: retrieval chỉ lấy memory liên quan đến câu hỏi hiện tại.
- Deletion compliance: user xóa/đổi scope thì fact không còn được dùng.
- Follow-up continuity: câu hỏi tiếp theo giữ được trip constraints quan trọng.
- Safety/privacy: không lưu sensitive hoặc unrelated personal data.

### Bước 11: Đánh giá lại sau evidence

- Full tool calling: chỉ reconsider khi bounded agent không đủ cho multi-entity comparison hoặc cross-trip analysis và có giải pháp provenance/policy.
- GraphRAG: chỉ reconsider khi corpus >5,000 cards và multi-hop queries phổ biến mà hybrid + topic briefs không giải quyết được.
- External memory frameworks: chỉ reconsider khi memory hiện tại có lỗi persistent về extraction, correction, relevance, deletion, hoặc long-term personalization.

## Prompt Budget và Context Window

### Hiện trạng: bottleneck nhân tạo

Model AI Ask hiện tại hỗ trợ context window rất lớn. Tổng prompt input hiện tại nhỏ so với window đó, nhưng phải tránh lẫn đơn vị chars/tokens.

| Component | Giới hạn hiện tại | Ước tính token | Ghi chú |
|-----------|-------------------|---------------|---------|
| System prompt | ~3,000 chars | ~1,000 | Cố định |
| Source bundle | 5,000 chars | ~1,500 | `maxSourceBundleSectionLength` |
| Chat history | 12,000 chars / 10 msg | ~4,000 | `maxPromptHistoryCharacters` / `maxPromptHistoryMessages` |
| Current question | ~500 chars | ~150 | Không giới hạn cứng |
| Tổng | ~20,500 chars | ~6,700 | Ước tính thận trọng |
| Context window | — | 1,000,000 | Theo model hiện tại |
| Tỷ lệ sử dụng | — | <1% | So trực tiếp theo token window |

Degradation modes vẫn cần tồn tại, nhưng thresholds hiện tại có thể trigger quá sớm với broad planning:

- Compact mode: hiện chỉ giữ rất ít cards/web so với câu hỏi broad.
- Minimal mode: gần như mất hết context.
- Essential mode: không còn cards/web/facts; chỉ nên là fallback cuối.

### Kế hoạch tăng theo giai đoạn

#### Source Bundle (`maxSourceBundleSectionLength`)

| Level | Chars | Mục tiêu | Trigger |
|-------|-------|----------|---------|
| Hiện tại | 5,000 | 3-card target, degradation sớm | — |
| Level 1 | 12,000 | 5-8 cards nếu upstream selection cho phép | Bước 1.5 |
| Level 2 | 20,000 | Topic brief + atomic cards | Khi topic briefs ready |
| Level 3 | 30,000 | Bounded refinement results | Chỉ khi Bước 9 triển khai |

#### Chat History (`maxPromptHistoryCharacters` / `maxPromptHistoryMessages`)

| Level | Chars | Messages | Trigger |
|-------|-------|----------|---------|
| Hiện tại | 12,000 | 10 | — |
| Level 1 | 20,000 | 14 | Bước 1.5 |
| Level 2 | 30,000 | 20 | Khi bounded agent cần turn context dài hơn |

### Quy tắc tăng

1. Tăng source bundle trước, history sau.
2. A/B test mỗi level trên cùng prompts.
3. Monitor input-token cost, latency, and degradation trigger rate.
4. Monitor prompt injection surface vì source bundle có evidence/web snippets.
5. Monitor lost-in-the-middle; nếu quality giảm, ưu tiên compression và source ordering thay vì tăng budget tiếp.
6. Provenance phải khớp chính xác với sources actually included sau compact/compression.

## Latency Budget

Latency dưới đây chỉ tính retrieval pre-answer pipeline, không tính final answer generation.

| Stage | Target p95 |
|-------|------------|
| Rule-based query decomposition | <=50ms |
| AI-assisted decomposition, nếu dùng | Cần đo với provider/model |
| FTS candidate retrieval | <=200ms |
| Vector similarity search | <=300ms |
| RRF fusion + diversity selection | <=50ms |
| Deterministic contextual compression | <=100ms |
| Bounded refinement, nếu trigger | Cần đo; không giả định 800ms trước khi benchmark |
| Total without AI refinement | <=700ms target |
| Total with AI refinement | <=2,000ms target trước answer generation |

Nếu vượt budget: optimize trước khi thêm complexity, giảm candidate pool, tắt AI-assisted decomposition, hoặc skip refinement.

## Dự báo Scale và chiến lược tương ứng

| Giai đoạn | Corpus | Bottleneck | Chiến lược |
|-----------|--------|------------|------------|
| Hiện tại | ~100 cards | Recall | FTS + evaluation baseline |
| YouTube ramp-up | 500-2,000 | Precision + diversity | Hybrid retrieval + decomposition + type-diversity |
| YouTube steady-state | 2,000-5,000 | Coverage + prompt efficiency | Topic briefs + bounded agent nếu evaluation yêu cầu |
| Long-term | 5,000+ | Cần evidence | Reconsider full agentic/GraphRAG nếu hybrid + briefs fail |

## Quyết định hoãn lại

### GraphRAG

Không xây GraphRAG. Travel knowledge hiện không có multi-hop complexity đủ rõ. Relationships nên tiếp tục nằm ở relational metadata: `routeSegment`, `locationName`, `type`, `tags`, `conditions`, source links, và future related-card links.

Chỉ reconsider khi corpus >5,000 cards và có evidence rằng hybrid retrieval + topic briefs fail trên multi-hop route/entity queries thường gặp.

### Full Tool Calling

Không cho AI quyền gọi tools tự do vì:

1. Phá vỡ provenance tracking.
2. Phá vỡ policy enforcement per-card.
3. Latency/cost khó bound.
4. Streaming UX bị gián đoạn trong reasoning/tool phase.

Bounded agent là middle-ground giữ server kiểm soát trong khi thêm khả năng refinement.

### Automatic Decay

Không tự động depreciate knowledge dựa trên tuổi hoặc vector similarity. Dùng `freshness_sensitive` và explicit verification policies. Source date là ranking signal, không phải removal trigger. Merge duplicates chỉ qua Knowledge workflow có audit.

### External Memory Frameworks

Không thêm Mem0, Zep, LangMem. Cải thiện `chat_context` extraction, correction/supersession, relevance, deletion trước. Bất kỳ adoption nào phải giữ XuyenViet là source of truth và đáp ứng deletion, provenance, authorization, scope requirements.

## Reranker

Thêm reranker chỉ sau khi Bước 8 cho thấy hybrid retrieval + diversity selection không đủ. Reranker chỉ rerank candidate pool 20-50, không nhận full corpus. Ưu tiên lightweight reranker có Vietnamese support và deployability rõ ràng.

## Thứ tự triển khai tóm tắt

```text
  1.  Hoàn thiện Epic 4 hiện tại
  1.5 Tăng prompt budget Level 1 + kiểm tra source selection/provenance
  2.  Full-text search + retrieval evaluation baseline
  3.  Lifecycle-safe embeddings với deployability gate
  4.  Hybrid retrieval + RRF
  5.  Query decomposition rule-based trước, AI-assisted chỉ khi evaluation cần
  6.  Route-aware scoping + type-diversity + deterministic compression
  7.  Topic briefs khi density/evaluation chứng minh cần
  8.  Evaluation checkpoint quyết định bounded agent/reranker/budget tiếp
  9.  Bounded agent nếu facet miss rate >20% và corpus >2,000 cards
 10.  Cải tiến trí nhớ traveler + memory evaluation
 11.  Đánh giá lại full tool calling, GraphRAG, external memory frameworks
```

## Tham chiếu

- Lộ trình v1: `docs/roadmaps/knowledge-retrieval-and-traveler-memory.md`
- Lộ trình v2: `docs/roadmaps/retrieval-va-tri-nho-traveler-v2.md`
- YouTube Discovery Proposal: `docs/proposals/ai-first-youtube-discovery.md`
- Architecture Spine: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
