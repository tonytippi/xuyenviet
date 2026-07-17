ALTER TABLE "sources" DROP CONSTRAINT "sources_kind_check";--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_url_kind_check";--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_kind_check" CHECK ("sources"."kind" in ('url', 'facebook', 'youtube', 'copied_post', 'pasted_text', 'screenshot'));--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_url_kind_check" CHECK ("sources"."kind" not in ('url', 'facebook', 'youtube') or "sources"."url" is not null);