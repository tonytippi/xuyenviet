CREATE TABLE "message_image_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"original_file_name" text,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_image_attachments_mime_type_check" CHECK ("message_image_attachments"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "message_image_attachments_byte_size_check" CHECK ("message_image_attachments"."byte_size" > 0 and "message_image_attachments"."byte_size" <= 5242880)
);
--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_user_id_idx" ON "messages" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_message_owner_fk" FOREIGN KEY ("message_id","user_id") REFERENCES "public"."messages"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_image_attachments_conversation_id_idx" ON "message_image_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "message_image_attachments_message_id_idx" ON "message_image_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_image_attachments_user_id_idx" ON "message_image_attachments" USING btree ("user_id");
