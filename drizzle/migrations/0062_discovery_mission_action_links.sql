ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN "mission_action_id" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_mission_action_id_check" CHECK ("youtube_discovery_query_proposals"."mission_action_id" is null or "youtube_discovery_query_proposals"."mission_action_id" ~ '^mission-[a-f0-9]{32}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_query_mission_action_id_idx" ON "youtube_discovery_query_proposals" ("mission_action_id") WHERE "mission_action_id" is not null;
