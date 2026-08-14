ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "query_builder_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD CONSTRAINT "youtube_discovery_policy_versions_query_builder_version_check" CHECK ("query_builder_version" BETWEEN 1 AND 2);
--> statement-breakpoint
ALTER TABLE "youtube_discovery_appearances" ADD COLUMN "search_tranche" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_appearances" ADD CONSTRAINT "youtube_discovery_appearances_search_tranche_check" CHECK ("search_tranche" IS NULL OR "search_tranche" IN ('medium', 'long'));
