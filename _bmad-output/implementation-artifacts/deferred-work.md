- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-6-environment-and-public-launch-safety-baseline.md`
  summary: Add automated tests for environment safety guards when the repository has a test framework.
  evidence: Story 1.6 added production placeholder, APP_ENV, and database URL guard behavior that is currently verified by CLI checks because no unit or integration test framework exists yet.
  status: resolved
  resolved_on: 2026-07-06
  resolved_by: Story 2.0 (Epic 1 retrospective 2026-07-06 authorized insertion of Story 2.0 to introduce test framework and retroactive Epic 1 coverage)
- source_spec: `spec-2-5-continue-conversation-with-context.md`
  summary: Harden concurrent continuation submissions for the same conversation.
  evidence: Review found two tabs can submit to the same conversation at once; both requests may read the same prior history before either sees the other in-flight turn, creating stale-context assistant replies despite persisted ordering.
- source_spec: `spec-2-7-stream-ai-ask-responses-and-accept-traveler-image-input.md`
  summary: Add platform-level multipart/body-size enforcement for AI Ask streaming uploads.
  evidence: The route rejects `content-length` values above 6MB before parsing, but requests without reliable `content-length` still depend on the deployment platform/proxy to enforce aggregate body limits before `request.formData()` buffers multipart data.
