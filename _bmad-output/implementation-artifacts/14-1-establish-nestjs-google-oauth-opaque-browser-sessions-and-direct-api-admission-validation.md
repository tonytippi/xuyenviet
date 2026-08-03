# Story 14.1 Validation Report

Date: 2026-08-03
Status: ready for development

## Result

The Story 14.1 brief is implementation-ready.

- The approved course correction is cited and its decisions are explicit.
- Acceptance criteria cover OAuth transaction safety, opaque session lifecycle, direct API principal admission, CSRF/origin policy, clean-break re-login, contracts, and tests.
- The story preserves the current BFF path until Story 14.2; it does not create a dual writer or remove compatibility prematurely.
- Existing BFF guard, Auth.js root implementation, database identities, admin identity OAuth, contracts, OpenAPI, and targeted tests were inspected and named.
- Known architectural conflict is explicit: `RequestPrincipal` currently encodes BFF-only issuer/token fields. The implementation must normalize this boundary without leaking a browser credential model into domain authorization.

## Required Pre-Implementation Checks

1. Confirm the actual production/staging traveler and admin callback origins before deployment configuration is written.
2. Confirm whether session storage can be clean-break migrated in the intended environment. The approved policy is no adoption of existing Auth.js sessions.
3. Create the story-specific migration only after the session/OAuth transaction persistence schema and cleanup method are reviewed.
4. Keep database integration tests serial and bind them exclusively to `DATABASE_URL_TEST`.
