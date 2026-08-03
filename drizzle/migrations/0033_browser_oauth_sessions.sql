CREATE TABLE "browser_oauth_transactions" ("id" text PRIMARY KEY NOT NULL, "state" text NOT NULL UNIQUE, "code_verifier" text NOT NULL, "return_url" text NOT NULL, "expires" timestamp NOT NULL);
CREATE TABLE "browser_sessions" ("session_lookup_hash" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "csrf_hash" text NOT NULL, "expires" timestamp NOT NULL, "revoked_at" timestamp);
CREATE INDEX "browser_sessions_live_user_idx" ON "browser_sessions" USING btree ("user_id", "expires");
