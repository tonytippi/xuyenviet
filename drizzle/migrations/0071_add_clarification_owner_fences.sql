CREATE UNIQUE INDEX IF NOT EXISTS "ai_ask_commands_id_user_id_idx" ON "ai_ask_commands" ("id", "user_id");
DELETE FROM "planning_clarification_attempts" AS attempt WHERE NOT EXISTS (SELECT 1 FROM "ai_ask_commands" AS command WHERE command.id = attempt.command_id AND command.user_id = attempt.user_id);
ALTER TABLE "planning_clarification_attempts" DROP CONSTRAINT IF EXISTS "planning_clarification_attempt_command_owner_fk";
ALTER TABLE "planning_clarification_attempts" ADD CONSTRAINT "planning_clarification_attempt_command_owner_fk" FOREIGN KEY ("command_id", "user_id") REFERENCES "ai_ask_commands"("id", "user_id") ON DELETE CASCADE;
ALTER TABLE "planning_clarification_sessions" DROP CONSTRAINT IF EXISTS "planning_clarification_session_command_owner_fk";
ALTER TABLE "planning_clarification_sessions" ADD CONSTRAINT "planning_clarification_session_command_owner_fk" FOREIGN KEY ("command_id", "user_id") REFERENCES "ai_ask_commands"("id", "user_id") ON DELETE CASCADE;
