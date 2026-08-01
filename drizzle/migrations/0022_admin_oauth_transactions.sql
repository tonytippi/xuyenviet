CREATE TABLE "admin_oauth_transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "state" text NOT NULL,
  "code_verifier" text NOT NULL,
  "callback_url" text NOT NULL,
  "expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_oauth_transactions_state_unique" ON "admin_oauth_transactions" USING btree ("state");
