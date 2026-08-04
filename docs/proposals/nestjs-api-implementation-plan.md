# Kế Hoạch Thực Hiện NestJS API Và Admin Tách Riêng

## Trạng Thái

**Superseded on 2026-08-03.** Kế hoạch này ghi nhận khảo sát và trình tự BFF/API đã dẫn tới các foundations Epics 9-13. Nó không còn là kế hoạch triển khai, vì browser BFF/Auth.js và private bearer transport đã bị thay thế bởi [Direct API and NestJS-Owned Session Authentication Course Correction](../../_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-03-direct-api-session-auth.md) và Epic 14.

Giữ tài liệu này làm hồ sơ kỹ thuật lịch sử. Dùng PRD, Architecture Spine, `epics.md`, Epic 14 context, và sprint status hiện hành cho mọi quyết định hay implementation mới.

## Kết Quả Rà Soát

### Các Nền Tảng Có Thể Tái Sử Dụng

- Next.js 15 hiện dùng App Router, Auth.js database session với Google OAuth và role trong PostgreSQL (`src/auth.ts`). Web BFF có thể tiếp tục là browser boundary trong phase đầu.
- Drizzle hiện là schema/migration owner duy nhất. Knowledge ingestion/indexing đã dùng PostgreSQL claim, lease và fencing; Trip Change Proposal expiry đã dùng transaction cùng `FOR UPDATE SKIP LOCKED` (`src/features/knowledge/*worker.ts`, `src/features/chat-trips/trip-proposal-expiry-worker.ts`). Nest worker phải gọi các use case này, không thay cơ chế điều phối bằng in-memory state.
- AI Ask hiện đã cung cấp NDJSON, kiểm tra upload, source bundle, policy gate, provenance và usage persistence theo transaction (`src/app/api/ai-ask/stream/route.ts`). Đây là vertical slice phù hợp nhất để kiểm chứng Nest API.
- Dockerfile hiện đã có build/migrator/worker stages. Chúng có thể được chuyển dần thành image và start command cho từng workspace thay vì thay toàn bộ pipeline ngay từ đầu.

### Khoảng Trống Phải Đóng Trước Cutover

1. Chưa có API principal độc lập với `AuthenticatedSession`, hoặc server-only resolver lấy chính xác Auth.js database session token từ BFF request đã xác thực. Current domain paths đọc session trực tiếp qua `getAuthenticatedSession()` hoặc import Next primitives.
2. AI Ask còn gọi `after()` của Next để chạy context extraction. Side effect này phải trở thành command/worker dispatch adapter để Nest có thể host transport mà không phụ thuộc Next runtime.
3. Server actions hiện trộn input `FormData`, authorization, command, `redirect`, và `revalidatePath`, đặc biệt ở admin/knowledge. Cần tách use case thuần trước; không chuyển nguyên server action vào controller.
4. Chưa có railway config, service topology, health contract, token issuer/verification contract, OpenAPI baseline hay CI matrix cho nhiều app.
5. Hai Next apps sẽ cùng cần Google OAuth/Auth.js nhưng không nên chia sẻ host-wide cookie. Shared auth package phải chỉ chia sẻ config/adapter helpers; session cookie và callback URL vẫn là cấu hình của từng app.

## Quy Tắc Thực Hiện

- Một aggregate command chỉ có một writer tại mọi thời điểm. Adapter Next cũ chỉ được gọi use case đã extract trong lúc chuyển đổi; không được dual-write.
- Database transaction, authorization policy và audit actor nằm trong domain/use case; HTTP controller, Next server action và worker loop chỉ thực hiện input/output adaptation.
- Không di chuyển toàn bộ `src` vào packages. Chỉ extract khi Nest API hoặc worker thực sự cần cùng use case với một client khác.
- Không public `api.xuyenviet.app` trong phase web-BFF. Web/admin gọi `api.railway.internal` và browser chỉ gọi origin Next tương ứng.
- Web/admin BFF dùng internal short-lived token; mobile sau này dùng Nest-hosted OAuth/OIDC token riêng. Cả hai chỉ map vào cùng domain-neutral `RequestPrincipal`, không làm domain API phụ thuộc Auth.js session format.
- Mỗi phase chỉ cut over một capability có contract, authorization matrix, rollback switch và test đầy đủ. Dọn legacy writer ngay sau cutover ổn định, không tích lũy compatibility layer.
- Platform foundation hoàn tất theo thứ tự: credential/principal và safe error contract, role/bootstrap governance, BFF CSRF/transport boundary, rồi protected-read cutover. Không triển khai một story tiêu thụ primitive khi prerequisite chưa được verified.

## Kiến Trúc Package Chuyển Tiếp

Khởi tạo pnpm workspace bằng cách giữ root package làm workspace root rồi thêm các app/package sau. `apps/web` chỉ được tạo khi code traveler thực sự được chuyển; không cần big-bang rename ngay ở spike.

```text
apps/
  web/                 # traveler Next.js, được chuyển dần từ root
  admin/               # Next.js operator app
  api/                 # NestJS HTTP bootstrap
  worker/              # NestJS worker bootstrap
packages/
  database/            # Drizzle schema, migration config và DB factory
  domain/              # extracted use cases, policies, ports, read models
  contracts/           # DTO/OpenAPI-facing types và error codes
  config/              # validated config, no secret values
```

Trong khi chưa chuyển root Next app, `apps/api` và `apps/worker` có thể import package/domain extracted qua workspace path. Không để Nest import từ `src/app`, `next/*`, `next-auth`, hoặc module có `"use server"`.

## Workstreams Và Thứ Tự

### 0. Approval Và BMad Baseline

1. Phê duyệt proposal kiến trúc, bao gồm Railway là target ban đầu và điều kiện pre-launch clean cutover.
2. Cập nhật PRD để bổ sung API-first/runtime requirements mà không đổi product scope.
3. Ratify Architecture Spine bằng architecture mới; đánh dấu các AD runtime Next-only đã bị thay thế để tránh hai source of truth.
4. Tạo epics/stories, implementation-readiness report và sprint status riêng cho initiative này.

**Exit:** BMad artifacts đều tham chiếu cùng target state; mỗi phase bên dưới có owner, acceptance criteria, rollback và dependency rõ ràng.

### 1. Four Spikes Bắt Buộc

Chạy các spike trên branch/worktree cách ly; không cut over traffic production.

| Spike | Cần chứng minh | Decision record tối thiểu |
|---|---|---|
| Identity/resource server | Web BFF mint short-lived, audience-scoped token; API từ chối expiry/issuer/audience/session/role-version sai; logout và role change bị thu hồi theo contract | signing/verification library, key storage/rotation, token claims/TTL, revocation/role freshness, internal caller authentication, CORS/CSRF |
| AI Ask NDJSON | Nest trả đúng `preparing`, `delta`, `done`, `error`; abort dừng provider; terminal answer/provenance/usage là atomic | stream timeout/cancellation policy, error codes, retry policy, persistence ownership |
| Railway/monorepo | `web`, `admin`, `api`, `worker`, migration job deploy độc lập; private DNS, domains, health và rollback chạy được ở staging | service names, build/start commands, env ownership, migration ordering, DNS/CSP/callback URLs |
| Worker operations | Graceful shutdown không nhận work mới, complete/lease-expire an toàn; duplicate poller và restart không double-write | readiness/liveness definition, metrics/log fields, one-shot sweep commands, alert thresholds |

**Exit:** Decision record cho từng spike, failure-mode tests pass, không còn blocker với Auth.js session, AI provenance hoặc PostgreSQL job invariants.

### 2. Extract Domain Boundary

Thực hiện theo vertical slice, bắt đầu với read-only authenticated capability nhỏ rồi AI Ask.

1. Định nghĩa `RequestPrincipal` và `SystemExecutionContext` độc lập với Auth.js. Next adapter phải resolve chính xác host-specific database session token từ request đã xác thực, kiểm tra ownership/expiry, rồi mới mint credential; Nest không parse cookie hoặc Auth.js serialization.
2. Chuyển `AuditActor` mapping, role lookup, ownership checks và transaction-scoped use case vào domain module. First-admin bootstrap dùng deployment-only `system-admin-bootstrap` context chỉ có quyền gọi command đó; nó không giả mạo `RequestPrincipal` admin. Không truyền `Request`, `Response`, `FormData`, session object hoặc Next callback vào use case.
3. Tách input parsing, redirect/revalidation và route-response formatting khỏi server actions. Giữ page-level redirect tại Next adapter.
4. Tách AI Ask orchestration khỏi `route.ts`: validate command input, persist user turn, assemble source bundle, stream provider, finalize transaction, và dispatch context extraction. Thay `after()` bằng port có hai adapter: Next background adapter tạm thời và worker/job adapter đích.
5. Thêm integration tests chạy `DATABASE_URL_TEST` cho ownership, authorization, audit/provenance và rollback của slice đã extract.

**Exit:** Nest controller và worker entrypoint có thể gọi use case mà không import `next/*`, `next-auth`, `server-only`, `redirect`, `revalidatePath`, hoặc Drizzle table của domain khác.

### 3. Platform Skeleton

1. Cài NestJS, pnpm workspace config, project references/build scripts và dependency constraints.
2. Dựng `apps/api` với config validation, `/health/live`, `/health/ready`, correlation ID middleware, global validation pipe, exception filter, auth guard và OpenAPI `/v1`. Safe error contract được tạo ở platform foundation để auth guard và các controller dùng cùng một envelope.
3. Dựng `apps/worker` với shutdown signal, readiness phản ánh database/loop state, structured logs và một low-risk loop. Ban đầu chọn Trip Proposal expiry vì đã idempotent và có concurrency tests.
4. Cung cấp thin API client cho Next BFF: internal base URL, correlation ID forwarding, token exchange, typed error mapping, timeout/abort forwarding. Unsafe cookie-authenticated routes dùng signed double-submit CSRF cookie/header và exact BFF origin validation trước bất kỳ credential mint/API call nào. Không thêm generated SDK.
5. Dựng `apps/admin` chỉ với Auth.js boundary, API client/BFF, health route và admin authorization guard. Chưa copy workflow hoặc cấp database credential cho app này.
6. Thêm Railway staging topology và migration release job. Migrations chỉ chạy một lần trước deploy workloads cần schema.

**Exit:** Bốn workload build/deploy độc lập ở staging; `/v1` có OpenAPI health/version và một authenticated read model; admin không truy cập DB trực tiếp; private networking và isolated env được kiểm chứng.

### 4. AI Ask Vertical-Slice Cutover

1. Publish `POST /v1/ai-ask/stream` với NDJSON event contract được test byte-for-byte ở protocol level.
2. Next traveler BFF gọi API private bằng scoped internal token; browser contract và UX giữ nguyên.
3. API thực hiện validation, owner scope, source bundle, provider stream, final policy gate, assistant/provenance/usage transaction và proposal draft như use case extracted.
4. Chuyển context extraction sang worker dispatch có durable/idempotent state trước khi bỏ Next `after()` dependency. Nếu dispatch fail, lưu trạng thái retryable và không làm completed answer sai lệch.
5. Shadow verification chỉ đọc/so sánh safe outcome ở development/staging. Không dual-write user message, assistant message, provenance hay usage.
6. Cutover bằng feature routing switch. Rollback trả request về legacy route trước khi nó nhận request; database shape và use case remain compatible.

**Exit:** Stream tests bao phủ event order, client abort, provider failure, terminal persistence, freshness policy và proposal failure isolation; web E2E không thay đổi behavior; API metrics có correlation ID xuyên BFF/API/provider.

### 5. Worker Migration

Di chuyển từng entrypoint, không di chuyển bảng/job protocol:

1. Trip Proposal expiry.
2. Knowledge indexing.
3. Knowledge ingestion, extraction và stale-lease recovery.
4. Retention sweeps thành `--once` commands cho Railway Cron nếu phù hợp.

Mỗi entrypoint phải giữ claim predicate, lease, fencing token, `FOR UPDATE SKIP LOCKED`, idempotency và system actor hiện có. Facebook/YouTube capture tiếp tục là operator-controlled runtime ngoài worker Railway.

**Exit:** Mỗi loop có graceful shutdown test, duplicate poller test, lag/retry/lease-recovery metric và restart runbook. Legacy script chỉ bị retire sau khi dashboard chứng minh ổn định.

### 6. Admin Migration Và Tách Deployment

Chuyển module-by-module, ưu tiên intake/knowledge workflow, review/recommendation, AI Gateway management rồi user-role operations.

1. Publish admin-scoped API contract, guard và safe read model cho workflow.
2. Port UI vào `apps/admin`; form handler chỉ gọi admin API BFF, không import domain/database mutation code.
3. Verify Google OAuth callback, host-only session cookie, CSP, redirect allowlist và role denial trên `admin.xuyenviet.app`.
4. Cut over một command tại một thời điểm; remove `/admin` legacy writer sau khi new UI nhận traffic.

**Exit:** Toàn bộ operational workflow chạy ở `admin.xuyenviet.app` qua API; traveler app không tải admin navigation/data; `apps/admin` không có database connection secret.

### 7. Complete API Cutover Và Pre-Launch Gate

Migrate các surface còn lại theo ownership: Chat/Trips reads and commands, Knowledge admin, AI Gateway admin, user/roles, feedback, referrals và usage reads. Mỗi capability phải có contract, pagination/error behavior khi áp dụng, authorization matrix, API integration tests và removed legacy owner.

Trước public launch, chạy load test cho DB connection pool và AI stream concurrency; kiểm thử restore backup; chuyển policy schema sang expand-migrate-contract khi staging/durable data bắt đầu tồn tại.

**Exit:** Không còn Next server action/route handler là domain transport owner; legacy `/admin` đã retire; public launch checklist của proposal được chấp thuận.

## Contract Chuẩn Cần Chốt Sớm

### Internal Web/Admin Token

- Token chỉ dùng từ Next BFF đến `api.railway.internal`; không gửi về browser và không dùng làm mobile credential.
- Claim tối thiểu: issuer, audience, subject user ID, exact Auth.js database session-token reference, issued/expiry time, cryptographically random token ID, role/version claim. Correlation ID không thuộc credential.
- API xác thực chữ ký, issuer, audience, clock bounds, expiry, active session ownership và role/version theo decision record. `jti` là token identity, không phải replay ledger. Sensitive admin actions luôn re-check role server-side.
- `web` và `admin` giữ credential riêng để mint/request token; API verifier/key material là secret riêng. Không dùng một static shared secret đại diện người dùng.
- Per issuer chỉ chấp nhận active `kid` và tối đa một previous verification-only `kid` với expiry overlap rõ ràng; cross-issuer và expired-overlap keys bị từ chối.
- Internal issuer và future Nest-hosted OAuth/OIDC issuer là hai boundary tách biệt, nhưng cùng normalize sang `RequestPrincipal` và `users.id`. API contract, ownership và authorization policy không đổi khi mobile identity cut over.

### API Error Và Observability

- Dùng một envelope ổn định: `code`, safe `message`, `requestId`, optional safe field violations. Không trả stack trace, SQL, provider payload, raw evidence hoặc operator-only state.
- BFF forward/generate correlation ID; API/worker log it alongside capability, principal class, aggregate ID khi safe, latency và result code.
- Readiness khác liveness: liveness chỉ xác nhận process event loop; readiness xác nhận config, database và critical dependencies cần nhận work.
- BFF CSRF cho unsafe cookie-authenticated routes yêu cầu exact origin, allowed same-site Fetch Metadata khi có, và signed double-submit `X-XuyenViet-CSRF` header khớp host-only `Secure`, `SameSite=Strict`, `Path=/` cookie. Token phải còn hạn và so sánh constant-time trước khi gọi API.

### Migration Safety

- Development database được reset hằng ngày: phase đầu có thể clean-break, nhưng migration history vẫn forward-only và Drizzle-owned.
- Khi staging/public có durable data hoặc concurrent old/new runtime, dùng expand-migrate-contract, compatibility matrix và migration job gating.
- Rollback traffic/code, không rollback destructive schema. Mọi migration reinterpret durable data phải có runbook và explicit approval.

## Backlog Đề Xuất

1. `NEST-0.1`: Ratify PRD/architecture/epics and readiness.
2. `NEST-0.2`: Identity resource-server spike and decision record.
3. `NEST-0.3`: Railway monorepo/deployment spike and decision record.
4. `NEST-0.4`: NDJSON Nest stream spike and decision record.
5. `NEST-0.5`: Worker lifecycle/operations spike and decision record.
6. `NEST-1.1`: Extract request principal, system execution context and authorization seam.
7. `NEST-1.2`: Extract AI Ask orchestration and durable context-extraction dispatch.
8. `NEST-2.1`: Bootstrap workspace, API, worker, contracts/config/database packages.
9. `NEST-2.2`: Deploy staging topology, migration job, health and telemetry baseline.
10. `NEST-3.1`: Cut over AI Ask through web BFF to API.
11. `NEST-4.1` to `NEST-4.4`: Move worker loops one at a time.
12. `NEST-5.1` to `NEST-5.4`: Move admin workflows and retire `/admin`.
13. `NEST-6.x`: Complete remaining API capability cutover and pre-launch hardening.

## Scope Controls

- Không xây mobile app, OAuth/OIDC authorization server, generated SDK, Redis/BullMQ/Kafka/Temporal, microservice split hoặc database-per-service trong roadmap này.
- Không migrate presentation-only component nếu nó không cần independent admin deployment hoặc API client boundary.
- Không expose `api.xuyenviet.app` chỉ để chứng minh API tồn tại; public exposure bắt đầu khi mobile/public integration có approved identity flow.

## Quyết Định Đã Phê Duyệt Và Defer

1. Đã phê duyệt target architecture, bao gồm NestJS API/worker owner, Next.js traveler BFF phase đầu, admin app/deployment riêng, và PostgreSQL/Drizzle data-plane owner.
2. Đã phê duyệt pre-launch clean cutover: public launch chờ toàn bộ legacy Next domain transport và `/admin` được retire; không dual-write aggregate command.
3. Đã phê duyệt các spike bắt buộc. Identity spike dùng two-token boundary: short-lived internal token cho web/admin BFF và Nest-hosted OAuth/OIDC token cho mobile sau này, cùng map về một `RequestPrincipal`.
4. Railway ownership, domains, secrets, backup/restore, monitoring và on-call policy được defer. Chúng là điều kiện bắt buộc trước staging topology/public launch, nhưng không chặn Workstream 0 hoặc code-level spikes.
