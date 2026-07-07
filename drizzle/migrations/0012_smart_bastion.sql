CREATE TABLE "chat_context" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"trip_project_id" text,
	"source_message_id" text NOT NULL,
	"field" text NOT NULL,
	"scope" text NOT NULL,
	"value" text NOT NULL,
	"confidence" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_context_field_check" CHECK ("chat_context"."field" in ('origin', 'destination', 'start_date', 'end_date', 'duration', 'adults', 'children', 'children_ages', 'budget', 'hotel_style', 'driving_tolerance', 'vehicle_needs', 'food_preferences', 'activity_preferences', 'itinerary_constraints', 'avoid_places', 'prior_trips', 'notes')),
	CONSTRAINT "chat_context_scope_check" CHECK ("chat_context"."scope" in ('conversation', 'trip_project')),
	CONSTRAINT "chat_context_status_check" CHECK ("chat_context"."status" in ('active', 'deleted')),
	CONSTRAINT "chat_context_value_not_empty_check" CHECK (length(btrim("chat_context"."value")) > 0),
	CONSTRAINT "chat_context_confidence_check" CHECK ("chat_context"."confidence" is null or ("chat_context"."confidence" >= 0 and "chat_context"."confidence" <= 100)),
	CONSTRAINT "chat_context_scope_trip_project_check" CHECK (("chat_context"."scope" = 'conversation' and "chat_context"."trip_project_id" is null) or ("chat_context"."scope" = 'trip_project' and "chat_context"."trip_project_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_source_message_owner_fk" FOREIGN KEY ("source_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_context_user_conversation_idx" ON "chat_context" USING btree ("user_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_context_user_trip_project_idx" ON "chat_context" USING btree ("user_id","trip_project_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_context_source_message_id_idx" ON "chat_context" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "chat_context_field_idx" ON "chat_context" USING btree ("field");