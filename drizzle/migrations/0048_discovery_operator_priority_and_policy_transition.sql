ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN "operator_priority_override" integer;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_operator_priority_override_check" CHECK ("operator_priority_override" IS NULL OR ("origin" = 'system' AND "operator_priority_override" BETWEEN 1 AND 100));
