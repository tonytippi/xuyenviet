# Lộ trình cải tiến Retrieval & Trí nhớ Traveler — Phiên bản 2

## Trạng thái

Đề xuất ngày 2026-08-09, dựa trên đánh giá hệ thống hiện tại và lộ trình v1 (`docs/roadmaps/knowledge-retrieval-and-traveler-memory.md`). Đây là lộ trình định hướng, không phải build plan đã được phê duyệt. Mỗi bước cần PRD và architecture riêng trước khi triển khai.

**Baseline hiện tại (2026-08-09):**

- Retrieval dùng ILIKE pattern matching trên `knowledge_card_search_documents`, giới hạn 3 cards, scoring theo term count (+2/+1).
- Source bundle prompt budget 5,000 chars (`maxSourceBundleSectionLength`) với progressive degradation (compact → minimal → essential).
- Chat history budget 12,000 chars / 10 messages (`maxPromptHistoryCharacters` / `maxPromptHistoryMessages`).
- Tổng prompt input ~20,500 chars (~6,700 tokens) — chỉ sử dụng **~3% context window** của model 1M tokens.
- Retrieval timeout 1.5s per task (parallel fetch).
- Provenance tracking đầy đủ qua `assistant_response_provenance` và `assistant_retrieval_decisions`.
- Policy enforcement per-card (contextual_use, caveat_only, exclude) trước khi data vào prompt.
- Web search fallback khi knowledge thiếu, stale, hoặc freshness-sensitive.
- Corridor seed target: 100 active evidence-grounded cards.
- YouTube discovery proposal đã soạn, chưa triển khai.

## Quyết định kiến trúc

### Giữ nguyên từ v1

- `knowledge_cards` là kho kiến thức duy nhất, evidence-grounded, source-linked.
- `chat_context` và trip-project context là kho trí nhớ traveler duy nhất.
- Search index và embeddings là derived retrieval index, không phải source of truth.
- Mọi câu trả lời phải preserve provenance tới knowledge cards, sources, traveler-memory facts, và web-search data.
- Không dùng Mem0, Zep, LangMem cho đến khi hệ thống hiện tại chứng minh thiếu sót cụ thể.
- Không xây GraphRAG. Travel knowledge không cần multi-hop reasoning; metadata filtering (`type`, `locationName`, `routeSegment`, `tags`, `conditions`) đã đóng vai trò "graph edges" dạng relational.

### Quyết định mới

1. **Query Decomposition là bước bắt buộc** — broad planning questions cần phân tách thành sub-queries và merge results thay vì single-shot search.

2. **Bounded Agent thay thế full Tool Calling** — khi corpus đạt 2,000+ cards, dùng server-controlled 2-step retrieval (1 optional AI refinement + 1 answer generation). Không cho AI quyền gọi tools tự do vì phá vỡ provenance tracking và policy enforcement.

3. **Topic Briefs phải triển khai sớm** — khi YouTube discovery tạo ra 500+ cards cho cùng corridor, topic briefs tổng hợp nhiều atomic cards thành 1 prompt-efficient block.

4. **Type-diversity selection là bắt buộc** — khi có 200+ cards liên quan đến 1 route, chọn cards theo type budget (route_note + hotel_area + warning + kid_friendly + food + cost) thay vì chỉ top-K by relevance.

5. **Prompt budget phải tăng theo tiến trình** — giới hạn 5,000 chars hiện tại chỉ sử dụng ~3% context window của model 1M tokens. Đây là bottleneck nhân tạo buộc phải compact/drop sources khi chưa cần. Tăng theo từng giai đoạn song song với cải tiến retrieval.

## Điểm yếu hiện tại và giải pháp

| # | Điểm yếu | Giải pháp | Bước |
|---|----------|-----------|------|
| 1 | ILIKE search — cùng ý khác từ sẽ miss | FTS → Embeddings → Hybrid RRF | 2, 3, 4 |
| 2 | Scoring đơn giản (term count) | RRF fusion + diversity selection + reranker (if needed) | 4, 6 |
| 3 | Hard limit 3 cards | Dynamic 3-8 cards theo question type, kết hợp contextual compression | 5, 6 |
| 4 | Vietnamese diacritics mismatch | PostgreSQL FTS với unaccent + Vietnamese config | 2 |
| 5 | Không có embedding-based retrieval | Lifecycle-safe embeddings cho policy-eligible cards | 3 |
| 6 | Prompt size cap 5,000 chars — chỉ dùng ~3% context window, compact mode mất sources | Tăng source bundle budget theo giai đoạn (12K→20K→30K) + tăng history + contextual compression | 1.5, 6, 7 |
| 7 | Retrieval timeout risk 1.5s | Latency budget per stage, performance regression testing | Xuyên suốt |
| 8 | Broad questions miss critical facets khi corpus lớn | Query decomposition + type-diversity + bounded agent | 5, 6, 9 |
| 9 | Follow-up questions mất context từ turn trước | Bounded agent refinement khi retrieval không đủ diversity | 9 |

## Target RAG Harness

Pipeline retrieval mục tiêu sau khi hoàn thành lộ trình:

```text
Câu hỏi traveler
  → query decomposition (rule-based hoặc AI-assisted)
  → route-aware scoping (filter theo routeSegment/locationName khi rõ)
  → broad hybrid candidate retrieval (FTS + vector, 20-50 candidates per sub-query)
  → merge + deduplicate + RRF rank fusion
  → type-diversity selection (type budget theo question category)
  → contextual compression (giữ facts relevant cho câu hỏi, bỏ noise)
  → [conditional] bounded agent refinement (nếu coverage thiếu)
  → topic brief injection (nếu có brief phù hợp)
  → bounded evidence bundle cho answer model
  → answer + persisted provenance
```

### Quy tắc Retrieval

Giữ nguyên từ v1 và bổ sung:

- Chỉ search knowledge cards đạt policy-eligible: active, source-linked, evidence-grounded. Cards conflicted, failed-verification, stale, suppressed đều excluded.
- Candidate pool 20-50 trước khi chọn final set. Câu hỏi hẹp cần 3 cards; broad planning cần 5-8.
- **Mới**: Final set chọn theo type-diversity budget, không chỉ relevance score. Route-spanning questions phải có đại diện cho mỗi facet quan trọng (route, accommodation, warning, food, activity, cost).
- **Mới**: Khi candidate pool > 50 cho cùng route segment, ưu tiên freshness, confidence cao, và source diversity (nhiều independent sources).
- Gemini-derived YouTube evidence là operator-only raw source, không phải retrieval input trực tiếp.

## Tiến hóa Search

### Bước 1: Hoàn thiện Epic 4 (hiện tại)

Hoàn thành state-aware indexing, source bundles, answer policy, fallback/provenance, trust details, và retrieval safety checks.

### Bước 1.5: Tăng Prompt Budget (song song với Epic 4 hoặc ngay sau)

Tăng `maxSourceBundleSectionLength` và `maxPromptHistoryCharacters` để tận dụng context window model hiện tại. Đây là thay đổi đơn giản (sửa constants + A/B test) nhưng impact lớn — loại bỏ compact/minimal/essential degradation mode cho hầu hết requests.

Chi tiết xem section **Prompt Budget và Context Window** bên dưới.

### Bước 2: Full-text Search + Evaluation Baseline

Thêm PostgreSQL full-text search cho Vietnamese keyword/entity matching.

**Chi tiết kỹ thuật:**

- PostgreSQL không có built-in Vietnamese dictionary. Cần spike test 3 options:
  - Option A: `unaccent` extension + `simple` config (không stemming, nhưng giải quyết diacritics)
  - Option B: Custom text search config với ICU tokenizer
  - Option C: `pg_bigm` extension cho bigram matching (tốt cho partial Vietnamese matching)
- Chọn option có recall tốt nhất trên test set Vietnamese travel queries.

**Evaluation framework (bắt buộc trước bước 3):**

- Tạo curated test set: 50-100 Vietnamese travel queries mapped tới expected relevant cards
- Metrics: Recall@3, Recall@5, MRR, MAP
- Automated: `pnpm test:retrieval` chạy regression trên mỗi retrieval change
- Baseline: đo metrics của ILIKE hiện tại trước khi chuyển sang FTS

### Bước 3: Lifecycle-safe Embeddings

Thêm embeddings cho policy-eligible cards với reindexing khi card thay đổi, archived, suppressed, conflicted, hoặc mất eligibility.

**Chi tiết kỹ thuật:**

- Embedding model cần hỗ trợ Vietnamese travel domain tốt
- Candidates: `multilingual-e5-large`, `bge-m3`, `Gemini text-embedding-004`, `voyage-3`
- Benchmark: top-5 recall trên test set Vietnamese travel queries trước khi chọn model
- Dimension vs. storage cost tradeoff: 768d vs 1024d vs 256d (quantized)
- Latency: API-based vs local inference — cần fit trong latency budget

### Bước 4: Hybrid Retrieval + RRF

Kết hợp FTS và vector similarity ranking bằng Reciprocal Rank Fusion.

- RRF là parameter-free fusion, không cần training
- Evaluate hybrid vs. FTS-only vs. vector-only trên test set
- Chỉ tiến sang bước 5 khi hybrid cải thiện measurable so với FTS-only

### Bước 5: Query Decomposition

**Phase 1 — Rule-based decomposition (zero AI cost):**

Phân tách broad planning questions thành 3-4 sub-queries, search parallel, merge + deduplicate results.

```text
Ví dụ: "Tư vấn lịch trình HN→HCM 2 tuần đi cùng 2 con nhỏ"
  → "lịch trình Hà Nội TP.HCM road trip"     (route_note)
  → "điểm dừng gia đình trẻ em"                (kid_friendly_tip, activity)
  → "khách sạn gia đình tuyến Bắc Nam"         (hotel_area)
  → "cảnh báo đường dài ô tô trẻ em"           (warning, route_note)
```

- Latency: +100-200ms (parallel DB queries) — nằm trong budget
- Cost: 0 (rule-based)
- Provenance: 100% intact — server controls toàn bộ

**Phase 2 — AI-assisted decomposition (1 lightweight AI call):**

Dùng cheap/fast model (ví dụ Gemini Flash) để decompose complex questions thành sub-queries khi rule-based cho kết quả chưa đủ.

- Cost: ~$0.001/query
- Latency: +200-400ms
- Chỉ trigger khi rule-based decomposition đạt ceiling (đánh giá qua evaluation)

### Bước 6: Route-aware Scoping + Type-diversity Selection + Contextual Compression

**Route-aware scoping:**

Khi câu hỏi chứa route segment cụ thể, filter cards theo `routeSegment`/`locationName` trước khi rank — thu hẹp pool từ toàn bộ corpus xuống ~30-50 cards liên quan.

**Type-diversity selection:**

Khi có 200+ cards liên quan, chọn final set theo type budget thay vì chỉ top-K:

```text
Broad planning → {route_note: 2, hotel_area: 1, warning: 1, food: 1, activity: 1, kid_friendly: 1, cost: 1}
Câu hỏi hẹp "khách sạn ĐN" → {hotel_area: 3, cost_note: 2, place: 1, kid_friendly: 1}
```

**Contextual compression:**

Compress mỗi card theo relevance với câu hỏi cụ thể — giữ facts relevant, bỏ noise:
- Giữ: title, type, location, confidence, policy, policyInstruction
- Compress: summary → chỉ sentences relevant
- Filter: practicalDetails → chỉ keys relevant
- Trim: evidence → chỉ quote relevant nhất

Kết quả: fit 5-8 cards vào cùng prompt budget thay vì 3 cards, mỗi card dense hơn.

### Bước 7: Topic Briefs

> **Quan trọng**: Bước này phải sẵn sàng trước hoặc ngay khi YouTube discovery tạo ra 500+ cards cho cùng corridor.

Topic briefs tổng hợp nhiều atomic cards thành 1 prompt-efficient block:

```text
Ví dụ: "Huế → Đà Nẵng: gia đình và điểm dừng"
  → Tổng hợp từ 30 atomic cards: route_notes, kid_friendly_tips, parking, warnings
  → 1 brief thay thế 30 cards trong prompt
  → Brief giữ supporting card IDs và stale khi supporting cards thay đổi
```

Quy tắc:
- Child cards giữ nguyên atomic, source-linked evidence
- Parent brief phải policy-eligible, không phải raw source
- Brief stale khi supporting cards thay đổi, archived, hoặc mất eligibility
- Chỉ tạo briefs cho route segments và topics có đủ density (≥ 5 atomic cards)

### Bước 8: Evaluation Checkpoint

Đo lường toàn bộ pipeline mới trước khi quyết định bounded agent:

**Metrics:**
- Recall@5, Recall@8 trên test set mở rộng (100-200 queries)
- **Type coverage**: % broad questions có ≥ 3 card types khác nhau trong final set
- **Facet miss rate**: % broad questions thiếu critical facet (warning, cost, kid-friendly khi relevant)
- Latency p50, p95, p99 cho toàn pipeline
- Prompt utilization: trung bình bao nhiêu cards fit, bao nhiêu bị drop

**Quyết định dựa trên evaluation:**
- Nếu facet miss rate > 20% cho broad questions → tiến sang Bước 9 (Bounded Agent)
- Nếu facet miss rate ≤ 20% → skip Bước 9, tiến sang Bước 10
- Nếu latency p95 > 2s → optimize trước khi thêm complexity

### Bước 9: Bounded Agent (2-step Retrieval) — Điều kiện

> Chỉ triển khai khi evaluation (Bước 8) cho thấy facet miss rate > 20% cho broad questions VÀ corpus > 2,000 cards.

Server-controlled 2-step retrieval, **không phải** full open-ended tool calling:

```text
Step 1 (server-controlled, parallel):
  - Decompose + search + merge + diversity select → initial set (8-12 cards)

Step 2 (server-controlled, conditional):
  - NẾU initial set thiếu diversity (< 3 relevant cards, hoặc 1 type chiếm > 60%):
    - AI nhận initial results + question
    - AI trả về max 2 refinement_queries (structured output)
    - Server search refinement queries qua cùng policy pipeline
    - Merge với initial results → final set
  - NẾU ĐỦ: dùng initial set
```

**Tại sao bounded agent thay vì full tool calling:**

| Aspect | Full Tool Calling | Bounded Agent |
|--------|-------------------|---------------|
| Max AI calls | Không giới hạn | **2** (1 refinement + 1 answer) |
| Latency worst case | 13-20s | **7-10s** |
| Provenance | Bị phá vỡ — AI tự chọn sources | **Intact** — server kiểm soát card selection |
| Policy enforcement | AI bypass policy per-card | **Server enforce** — refinement qua cùng pipeline |
| Streaming UX | Không có token cho đến khi xong tool calls | **Stream "preparing" trong refinement** |
| Cost | 3-5x | **1.3-1.5x** |

Full tool calling chỉ reconsider khi bounded agent chứng minh không đủ VÀ có giải pháp cho provenance + policy enforcement.

### Bước 10: Cải tiến Trí nhớ Traveler

Cải thiện extraction quality, correction handling, và relevance selection cho `chat_context` và trip-project context trước khi xem xét framework bên ngoài.

### Bước 11: Đánh giá lại (chỉ khi có evidence)

- Full tool calling: chỉ khi bounded agent chứng minh không đủ cho multi-entity comparison hoặc cross-trip analysis
- GraphRAG: chỉ khi corpus > 5,000 cards và multi-hop queries phổ biến mà hybrid + topic briefs không giải quyết được
- External memory frameworks: chỉ khi traveler memory có lỗi persistent với extraction, correction, relevance, hoặc long-term personalization

## Prompt Budget và Context Window

### Hiện trạng: bottleneck nhân tạo

Model AI Ask hiện tại hỗ trợ 1M tokens (~250,000 Vietnamese tokens). Tổng prompt input hiện tại:

| Component | Giới hạn hiện tại | ~Tokens | Ghi chú |
|-----------|-------------------|---------|------|
| System prompt | ~3,000 chars | ~1,000 | Cố định, 18 instruction lines |
| **Source bundle** | **5,000 chars** | **~1,500** | `maxSourceBundleSectionLength` — 3 cards + context + web |
| **Chat history** | **12,000 chars / 10 msg** | **~4,000** | `maxPromptHistoryCharacters` / `maxPromptHistoryMessages` |
| Current question | ~500 chars | ~150 | Không giới hạn cứng |
| **Tổng** | **~20,500 chars** | **~6,700** | — |
| **Context window** | — | **~250,000** | 1M tokens |
| **Tỷ lệ sử dụng** | — | — | **~2.7%** |

Degradation modes đang trigger quá sớm:
- **Compact mode**: 10 facts, 1 card, 2 web → mất 2/3 knowledge
- **Minimal mode**: 1 fact, 1 card, 1 web → gần như mất hết context
- **Essential mode**: 0 cards, 0 web, 0 facts → AI trả lời không có grounding

### Kế hoạch tăng theo giai đoạn

#### Source Bundle (`maxSourceBundleSectionLength`)

| Level | Chars | ~Cards fit | Trigger | Ghi chú |
|-------|-------|-----------|---------|------|
| Hiện tại | 5,000 | 3 | — | Compact mode thường xuyên trigger |
| **Level 1** | **12,000** | **5-8** | **Ngay (Bước 1.5)** | Loại bỏ compact mode cho hầu hết requests. Đủ cho diversity selection 5-8 cards |
| Level 2 | 20,000 | 8-12 + topic brief | Khi topic briefs ready (Bước 7) | Fit topic brief + atomic cards |
| Level 3 | 30,000 | 12+ cards + briefs | Khi bounded agent ready (Bước 9) | Refinement results cần space |

#### Chat History (`maxPromptHistoryCharacters` / `maxPromptHistoryMessages`)

| Level | Chars | Messages | Trigger | Ghi chú |
|-------|-------|----------|---------|------|
| Hiện tại | 12,000 | 10 | — | Đủ cho 5 turn conversations |
| **Level 1** | **20,000** | **14** | **Ngay (Bước 1.5)** | Đủ cho conversations dài hơn khi user refine lịch trình. Follow-up questions giữ được context tốt hơn |
| Level 2 | 30,000 | 20 | Khi bounded agent ready (Bước 9) | Bounded agent cần context dài hơn để detect coverage gaps từ turns trước |

### Quy tắc tăng

1. **Tăng source bundle trước, history sau** — source bundle là bottleneck chính ảnh hưởng answer quality. History hiện tại 12K/10msg đã đủ cho MVP.
2. **A/B test mỗi level** — đo answer quality (human eval hoặc automated), latency, cost trước khi commit.
3. **Monitor cost impact** — Level 1 thêm ~2,000 tokens input ≈ thêm ~$0.0001-0.001/request. Không đáng kể nhưng cần track.
4. **Monitor "lost in the middle"** — nếu answer quality giảm khi tăng context → cần contextual compression thay vì tăng thêm.
5. **Giữ progressive degradation** — vẫn cần compact/minimal mode nhưng với thresholds cao hơn. Essential mode (0 sources) chỉ trigger khi thực sự vượt budget mới.

### Thay đổi code (Bước 1.5)

Các constants cần sửa trong `packages/database/src/source-bundle.ts` và `packages/database/src/prompts.ts`:

```text
// source-bundle.ts
const maxSourceBundleSectionLength = 5_000;   → 12_000

// prompts.ts  
const maxPromptHistoryMessages = 10;          → 14
const maxPromptHistoryCharacters = 12_000;    → 20_000
```

Compact mode thresholds trong `buildCompactedSourceBundlePromptSection` cũng cần điều chỉnh tương ứng — compact dùng contextLimit=10 facts + 3 cards + 3 web thay vì 10/1/2 hiện tại.

### Tại sao không tăng thẳng lên 50,000+

- **Prompt injection surface** — source bundle chứa user-generated content (evidence quotes, web snippets). Mỗi char thêm là thêm attack surface. Tăng có kiểm soát.
- **Cost scaling** — tuy nhỏ per-request, nhưng scale theo active users. Monitor trước khi tăng tiếp.
- **"Lost in the middle" risk** — models mới handle tốt hơn đời cũ, nhưng vẫn cần A/B test validate.
- **Diminishing returns** — 12,000 chars đã fit 5-8 cards (đủ cho diversity selection). Thêm nữa chỉ hữu ích khi có topic briefs hoặc bounded agent.

## Latency Budget

Mỗi stage phải fit trong budget. Tổng pipeline ≤ 2,000ms (tăng từ 1,500ms hiện tại để accommodate complexity mới).

| Stage | Budget (p95) |
|-------|-------------|
| Query decomposition (rule-based) | ≤ 50ms |
| Query decomposition (AI-assisted) | ≤ 400ms |
| FTS candidate retrieval | ≤ 200ms |
| Vector similarity search | ≤ 300ms |
| RRF fusion + diversity selection | ≤ 50ms |
| Contextual compression | ≤ 100ms |
| Bounded agent refinement (if triggered) | ≤ 800ms |
| **Total (without refinement)** | **≤ 700ms** |
| **Total (with refinement)** | **≤ 1,500ms** |

Nếu vượt budget → optimize hoặc cut scope (bỏ AI-assisted decomposition, giảm candidate pool, skip refinement).

## Dự báo Scale và chiến lược tương ứng

| Giai đoạn | Corpus | Bottleneck | Chiến lược |
|-----------|--------|------------|------------|
| Hiện tại | ~100 cards | Recall | Hybrid retrieval + FTS + embeddings |
| YouTube ramp-up | 500-2,000 | Precision + Diversity | + Query decomposition + type-diversity + topic briefs |
| YouTube steady-state | 2,000-5,000+ | Coverage + Multi-facet | + Bounded agent + contextual compression |
| Long-term | 5,000+ | Cần đánh giá | Reconsider full agentic / GraphRAG nếu evidence supports |

## Quyết định hoãn lại

### GraphRAG

Không xây GraphRAG. Travel knowledge không có multi-hop complexity. Các "relationships" đã tồn tại dạng relational metadata: `routeSegment`, `locationName`, `type`, `tags`, `conditions`, `knowledgeCardSources`. Topic briefs sẽ cover trường hợp aggregation mà graph traversal thường giải quyết.

Chỉ reconsider khi corpus > 5,000 cards VÀ có evidence rằng queries như "tìm chuỗi điểm dừng cho EV trên tuyến có khách sạn pet-friendly gần nhà hàng chay" thường xuyên fail.

### Full Tool Calling

Không cho AI quyền gọi tools tự do. Lý do:
1. Phá vỡ provenance tracking — server mất quyền kiểm soát source bundle assembly
2. Phá vỡ policy enforcement — AI có thể dùng caveat_only card như factual recommendation
3. Latency nhân 3x, cost nhân 5x
4. Streaming UX bị disrupted — user không thấy gì trong reasoning phase

Bounded agent (Bước 9) là middle-ground giữ được provenance + policy trong khi thêm khả năng refinement.

### Automatic Decay

Không tự động depreciate knowledge dựa trên tuổi hoặc vector similarity. Dùng `freshness_sensitive` và explicit verification policies. Source date là ranking signal, không phải removal trigger. Merge duplicates chỉ qua Knowledge workflow có audit.

### External Memory Frameworks

Không thêm Mem0, Zep, LangMem. Cải thiện `chat_context` extraction + correction handling trước. Bất kỳ adoption nào phải giữ XuyenViet là source of truth và đáp ứng deletion, provenance, authorization, scope requirements.

## Reranker

Thêm reranker (cross-encoder) chỉ sau khi evaluation (Bước 8) cho thấy hybrid retrieval + diversity selection không đủ. Reranker rerank candidate pool (20-50), không nhận full corpus. Ưu tiên lightweight reranker có Vietnamese support.

## Thứ tự triển khai tóm tắt

```text
  1.  Hoàn thiện Epic 4 (indexing, source bundles, safety)        ← Đang làm
  1.5 Tăng prompt budget Level 1 (12K source + 20K history)       ← Mới, quick win
  2.  Full-text search + evaluation baseline                       ← Tiếp theo
  3.  Lifecycle-safe embeddings
  4.  Hybrid retrieval + RRF
  5.  Query decomposition (rule-based → AI-assisted)               ← Mới
  6.  Route-aware scoping + type-diversity + contextual compression ← Mới
  7.  Topic briefs + tăng prompt budget Level 2 (20K source)        ← Move sớm hơn
  8.  Evaluation checkpoint — quyết định bounded agent
  9.  Bounded agent + tăng prompt budget Level 3 (30K source)       ← Mới, điều kiện
 10.  Cải tiến trí nhớ traveler
 11.  Đánh giá lại: full tool calling, GraphRAG, external memory
```

## Tham chiếu

- Lộ trình v1: `docs/roadmaps/knowledge-retrieval-and-traveler-memory.md`
- YouTube Discovery Proposal: `docs/proposals/ai-first-youtube-discovery.md`
- Architecture Spine: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
