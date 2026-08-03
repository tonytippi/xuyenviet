# YouTube Capture Operations

## Status

YouTube capture is retired. Story 14.5 removed the root capture CLI and its cache-migration command, so there is no supported `pnpm youtube:capture` or `pnpm capture-cache:migrate` operation.

Do not invoke feature modules, use Gemini credentials, or write capture records directly as a replacement. The retained YouTube source and capture records are historical product data, not evidence of an active capture runtime.

The supported background-process owner is the bundled Worker. Its runtime, readiness checks, and operational evidence are documented in [Worker Operations](worker-operations.md). It does not implement YouTube capture.
