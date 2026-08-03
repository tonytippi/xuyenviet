export function credentialedBrowserCors(allowedOrigins: readonly string[]) {
  return {
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["content-type", "x-xuyenviet-csrf", "x-request-id", "idempotency-key"],
    exposedHeaders: ["x-request-id"],
  };
}
