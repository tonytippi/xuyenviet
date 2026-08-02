ALTER TABLE "users" DROP CONSTRAINT "users_no_system_executor_id_check";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_no_system_executor_id_check" CHECK ("id" NOT IN ('system-ai-orchestration', 'system-knowledge-pipeline', 'system-trip-planning', 'system-facebook-capture', 'system-youtube-capture', 'system-admin-bootstrap'));
