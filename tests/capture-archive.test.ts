import { describe, expect, test } from "vitest";

import { sanitizeCacheValue, artifactHash, isAliasCompatible, isArtifactContentValid } from "@/features/knowledge/capture-cache";
import { CAPTURE_PAYLOAD_SCHEMA_VERSION, FACEBOOK_CAPTURE_METHOD_VERSION, YOUTUBE_CAPTURE_METHOD_VERSION, captureReuseKey, facebookResourceIdentity, youtubeResourceIdentity } from "@/features/knowledge/capture-identity";
import { assertPostgresUrl, getDatabaseUrl } from "../scripts/db-env";
import { sanitizeYoutubeMetadata } from "@/features/knowledge/youtube-capture";
import { parseCachedYoutubePayload } from "../scripts/youtube-capture";
import { parseCachedFacebookPayload } from "../scripts/facebook-capture";

describe("capture archive identities", () => {
  test("uses stable Facebook post identity across aliases and gives final URLs precedence", () => {
    expect(facebookResourceIdentity({ submittedUrl: "https://m.facebook.com/groups/a/posts/123?fbclid=x", finalUrl: "https://www.facebook.com/groups/a/posts/123" })).toBe("post:123");
    expect(facebookResourceIdentity({ submittedUrl: "https://facebook.com/groups/a" })).toBeNull();
  });

  test("accepts only validated Facebook aliases with a canonical post identity", () => {
    const submitted = "https://www.facebook.com/share/p/example/?mibextid=x";
    const final = "https://www.facebook.com/groups/a/posts/123";
    expect(facebookResourceIdentity({ submittedUrl: submitted, finalUrl: final })).toBe("post:123");
    expect(facebookResourceIdentity({ submittedUrl: submitted })).toBe("submitted:https://facebook.com/share/p/example?mibextid=x");
  });

  test("versions provider reuse keys independently of post-capture content hashes", () => {
    const facebook = captureReuseKey({ provider: "facebook", resourceIdentity: "post:123", captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION });
    const youtube = captureReuseKey({ provider: "youtube", resourceIdentity: "video:abcDEF12345", captureMethodVersion: YOUTUBE_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: "v1", model: "model-a" });
    expect(facebook).not.toBe(youtube);
    expect(youtube).not.toBe(captureReuseKey({ provider: "youtube", resourceIdentity: "video:abcDEF12345", captureMethodVersion: YOUTUBE_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: "v2", model: "model-a" }));
    expect(artifactHash({ rawText: "same" })).toBe(artifactHash({ rawText: "same" }));
  });

  test("requires canonical YouTube video identity", () => {
    expect(youtubeResourceIdentity("https://www.youtube.com/watch?v=abcDEF12345")).toBe("video:abcDEF12345");
    expect(youtubeResourceIdentity("https://www.youtube.com/@xuyenviet")).toBeNull();
  });

  test("accepts an alias only for the requested versions and validated submitted-share mapping", () => {
    const artifact = { provider: "facebook", resourceIdentity: "post:123", captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION } as never;
    const requested = { provider: "facebook" as const, resourceIdentity: "submitted:https://facebook.com/share/p/example", captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, allowValidatedAlias: true };
    expect(isAliasCompatible(artifact, requested)).toBe(true);
    expect(isAliasCompatible(artifact, { ...requested, allowValidatedAlias: false })).toBe(false);
    expect(isAliasCompatible(artifact, { ...requested, resourceIdentity: "post:999" })).toBe(false);
    expect(isAliasCompatible(artifact, { ...requested, captureMethodVersion: "facebook-visible-dom-v1" })).toBe(false);
    expect(isAliasCompatible(artifact, { ...requested, payloadSchemaVersion: "2" })).toBe(false);
  });

  test("removes prohibited cache metadata recursively", () => {
    expect(sanitizeCacheValue({ safe: "yes", cookies: "no", nested: { localStorage: "no", count: 1 }, providerResponse: "no" })).toEqual({ safe: "yes", nested: { count: 1 } });
  });

  test("bounds nested cache values and treats a tampered artifact as a cache miss", () => {
    expect(sanitizeCacheValue({ nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: "too deep" } } } } } } } } })).toEqual({ nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: {} } } } } } } } });
    const payload = { rawText: "trusted" };
    expect(isArtifactContentValid(payload, artifactHash(payload))).toBe(true);
    expect(isArtifactContentValid(JSON.stringify(payload), artifactHash(payload))).toBe(true);
    expect(isArtifactContentValid({ rawText: "tampered" }, artifactHash(payload))).toBe(false);
    expect(artifactHash({ b: 2, a: 1 })).toBe(artifactHash({ a: 1, b: 2 }));
  });

  test("uses an explicit YouTube metadata allowlist while retaining prompt version", () => {
    expect(sanitizeYoutubeMetadata({ captureMethod: "gemini_youtube_url", capturedAt: "2026-01-01T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "model", promptVersion: "v1", evidenceCount: 1, latencyMs: 2, rawPrompt: "secret", providerResponse: "secret", errorBody: "secret" })).toEqual({ captureMethod: "gemini_youtube_url", capturedAt: "2026-01-01T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "model", promptVersion: "v1", evidenceCount: 1, latencyMs: 2 });
  });

  test("rejects malformed provider payloads before a cache replay can write production", () => {
    expect(() => parseCachedYoutubePayload({ evidence: [{ claim_vi: "unvalidated" }] })).toThrow("gemini_invalid_evidence_item");
    expect(() => parseCachedFacebookPayload({ rawText: "text", metadata: {}, sourceUrl: "https://www.facebook.com/groups/a/posts/123" }, "https://www.facebook.com/groups/a/posts/123")).toThrow("cache_invalid_facebook_payload");
  });

  test("rejects malformed cache URLs without disclosing credentials", () => {
    expect(() => assertPostgresUrl("https://user:secret@example.com/cache", "CAPTURE_CACHE_DATABASE_URL")).toThrow("CAPTURE_CACHE_DATABASE_URL must be a valid PostgreSQL URL.");
    expect(() => assertPostgresUrl("postgresql://localhost", "CAPTURE_CACHE_DATABASE_URL")).toThrow("CAPTURE_CACHE_DATABASE_URL must be a valid PostgreSQL URL.");
  });

  test("validates DATABASE_URL with the same PostgreSQL validation", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "https://user:secret@example.com/app";
    try {
      expect(() => getDatabaseUrl()).toThrow("DATABASE_URL must be a valid PostgreSQL URL.");
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
