CREATE TABLE "admin_sessions" (
  "session_token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires" timestamp NOT NULL,
  "revoked_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "admin_sessions_live_user_idx" ON "admin_sessions" USING btree ("user_id", "expires");
