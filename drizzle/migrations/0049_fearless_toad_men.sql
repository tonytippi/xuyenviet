CREATE TABLE "knowledge_index_backfill_state" (
	"id" text PRIMARY KEY NOT NULL,
	"cursor" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
