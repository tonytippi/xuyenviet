import { describe, expect, test, vi } from "vitest";

const getAuthenticatedSession = vi.fn();
const mintWebBffCredential = vi.fn();

vi.mock("@/server/auth", () => ({ getAuthenticatedSession }));
vi.mock("@/server/bff-credentials", () => ({
  BffCredentialError: class BffCredentialError extends Error {},
  mintWebBffCredential,
}));

describe("BFF session route", () => {
  test("mints server-side but serializes no credential, session token, or private JWK", async () => {
    const credential = "private-internal-credential";
    const sessionToken = "opaque-session-token";
    const privateJwk = '{"d":"private-jwk-material"}';
    getAuthenticatedSession.mockResolvedValue({ userId: "traveler", email: "traveler@example.com" });
    mintWebBffCredential.mockResolvedValue(credential);
    const { GET } = await import("@/app/api/bff/session/route");

    const response = await GET();
    const body = await response.text();

    expect(mintWebBffCredential).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(body).toBe('{"authenticated":true,"user":{"id":"traveler"}}');
    expect(body).not.toContain(credential);
    expect(body).not.toContain(sessionToken);
    expect(body).not.toContain(privateJwk);
    expect(body).not.toContain("private-jwk-material");
  });
});
