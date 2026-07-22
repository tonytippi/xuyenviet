CREATE TABLE "knowledge_index_dirty_markers" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_index_dirty_markers_versions_check" CHECK ("knowledge_index_dirty_markers"."content_version" >= 1 and "knowledge_index_dirty_markers"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_index_dirty_markers_reason_check" CHECK (length(btrim("knowledge_index_dirty_markers"."reason")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "knowledge_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"priority" integer NOT NULL,
	"policy_id" text,
	"policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution" text,
	"sampling_disposition_reason" text,
	"sampling_rationale" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_recommendations_versions_check" CHECK ("knowledge_recommendations"."content_version" >= 1 and "knowledge_recommendations"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_recommendations_status_check" CHECK ("knowledge_recommendations"."status" in ('open', 'in_review', 'resolved', 'superseded')),
	CONSTRAINT "knowledge_recommendations_reason_check" CHECK ("knowledge_recommendations"."reason" in ('risk', 'weak_evidence', 'freshness', 'conflict', 'duplicate_risk', 'missing_context', 'verification', 'relation', 'sampling')),
	CONSTRAINT "knowledge_recommendations_priority_check" CHECK ("knowledge_recommendations"."priority" between 1 and 100),
	CONSTRAINT "knowledge_recommendations_policy_snapshot_check" CHECK (jsonb_typeof("knowledge_recommendations"."policy_snapshot") = 'object' and octet_length("knowledge_recommendations"."policy_snapshot"::text) <= 1024),
	CONSTRAINT "knowledge_recommendations_resolution_check" CHECK ("knowledge_recommendations"."resolution" is null or "knowledge_recommendations"."resolution" in ('accepted', 'edited', 'suppressed', 'restored', 'verified', 'relation_resolved', 'sampling_passed', 'sampling_failed')),
	CONSTRAINT "knowledge_recommendations_sampling_reason_check" CHECK ("knowledge_recommendations"."sampling_disposition_reason" is null or "knowledge_recommendations"."sampling_disposition_reason" in ('confirmed', 'minor_issue', 'insufficient_evidence', 'stale_or_changed', 'material_error', 'safety_risk')),
	CONSTRAINT "knowledge_recommendations_sampling_rationale_check" CHECK ("knowledge_recommendations"."sampling_rationale" is null or length(btrim("knowledge_recommendations"."sampling_rationale")) between 1 and 500),
	CONSTRAINT "knowledge_recommendations_sampling_disposition_shape_check" CHECK (("knowledge_recommendations"."resolution" in ('sampling_passed', 'sampling_failed') and "knowledge_recommendations"."sampling_disposition_reason" is not null) or (("knowledge_recommendations"."resolution" is null or "knowledge_recommendations"."resolution" not in ('sampling_passed', 'sampling_failed')) and "knowledge_recommendations"."sampling_disposition_reason" is null and "knowledge_recommendations"."sampling_rationale" is null)),
	CONSTRAINT "knowledge_recommendations_resolved_shape_check" CHECK (("knowledge_recommendations"."status" in ('open', 'in_review') and "knowledge_recommendations"."resolution" is null and "knowledge_recommendations"."resolved_by_user_id" is null and "knowledge_recommendations"."resolved_at" is null) or ("knowledge_recommendations"."status" in ('resolved', 'superseded') and "knowledge_recommendations"."resolution" is not null and "knowledge_recommendations"."resolved_by_user_id" is not null and "knowledge_recommendations"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_sampling_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"window_starts_at" timestamp NOT NULL,
	"window_ends_at" timestamp NOT NULL,
	"sampling_percent" integer DEFAULT 15 NOT NULL,
	"cohort_key" text NOT NULL,
	"escalated_at" timestamp,
	"suppressed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sampling_policies_window_check" CHECK ("knowledge_sampling_policies"."window_ends_at" > "knowledge_sampling_policies"."window_starts_at"),
	CONSTRAINT "knowledge_sampling_policies_percent_check" CHECK ("knowledge_sampling_policies"."sampling_percent" between 1 and 100),
	CONSTRAINT "knowledge_sampling_policies_cohort_key_check" CHECK (length(btrim("knowledge_sampling_policies"."cohort_key")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "knowledge_sampling_cohort_members" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sampling_cohort_members_versions_check" CHECK ("knowledge_sampling_cohort_members"."content_version" >= 1 and "knowledge_sampling_cohort_members"."evidence_set_revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_policy_id_knowledge_sampling_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."knowledge_sampling_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD CONSTRAINT "knowledge_sampling_cohort_members_policy_id_knowledge_sampling_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."knowledge_sampling_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD CONSTRAINT "knowledge_sampling_cohort_members_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_index_dirty_markers_version_reason_idx" ON "knowledge_index_dirty_markers" USING btree ("knowledge_card_id","content_version","evidence_set_revision","reason");--> statement-breakpoint
CREATE INDEX "knowledge_index_dirty_markers_created_at_idx" ON "knowledge_index_dirty_markers" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_recommendations_open_version_reason_idx" ON "knowledge_recommendations" USING btree ("knowledge_card_id","content_version","evidence_set_revision","reason") WHERE "knowledge_recommendations"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_open_queue_idx" ON "knowledge_recommendations" USING btree ("status","priority","created_at") WHERE "knowledge_recommendations"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_card_version_idx" ON "knowledge_recommendations" USING btree ("knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_policies_cohort_key_idx" ON "knowledge_sampling_policies" USING btree ("cohort_key");--> statement-breakpoint
CREATE INDEX "knowledge_sampling_policies_window_idx" ON "knowledge_sampling_policies" USING btree ("window_starts_at","window_ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_cohort_members_policy_version_idx" ON "knowledge_sampling_cohort_members" USING btree ("policy_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_sampling_cohort_members_policy_idx" ON "knowledge_sampling_cohort_members" USING btree ("policy_id");
