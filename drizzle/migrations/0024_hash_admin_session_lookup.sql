-- Existing admin browser sessions cannot be safely transformed without the API-only HMAC key.
-- Invalidate them rather than retaining a database-resident bearer credential.
DELETE FROM "admin_sessions";
--> statement-breakpoint
ALTER TABLE "admin_sessions" DROP CONSTRAINT "admin_sessions_pkey";
--> statement-breakpoint
ALTER TABLE "admin_sessions" RENAME COLUMN "session_token" TO "session_lookup_hash";
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD PRIMARY KEY ("session_lookup_hash");
