# Facebook Capture Operations

## Status

Facebook capture is retired. Story 14.5 removed the root capture CLI and its cache-migration command, so there is no supported `pnpm facebook:capture` or `pnpm capture-cache:migrate` operation.

Do not run source modules, archived commands, Playwright profiles, or ad-hoc database writes as substitutes. The retained Facebook source and capture records are historical product data, not evidence of an active capture runtime.

The supported background-process owner is the bundled Worker. Its runtime, readiness checks, and operational evidence are documented in [Worker Operations](worker-operations.md). It does not implement Facebook capture.
