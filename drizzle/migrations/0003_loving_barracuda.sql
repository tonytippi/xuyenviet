CREATE TABLE "referral_attributions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"referral_code_id" text NOT NULL,
	"referrer_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_attributions_no_self_referral_check" CHECK ("referral_attributions"."referrer_user_id" is null or "referral_attributions"."referrer_user_id" <> "referral_attributions"."user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"referrer_user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_format_check" CHECK ("referral_codes"."code" ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$')
);
--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_attributions_user_id_idx" ON "referral_attributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "referral_attributions_referral_code_id_idx" ON "referral_attributions" USING btree ("referral_code_id");--> statement-breakpoint
CREATE INDEX "referral_attributions_referrer_user_id_idx" ON "referral_attributions" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referral_attributions_created_at_idx" ON "referral_attributions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_idx" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_codes_active_idx" ON "referral_codes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "referral_codes_referrer_user_id_idx" ON "referral_codes" USING btree ("referrer_user_id");