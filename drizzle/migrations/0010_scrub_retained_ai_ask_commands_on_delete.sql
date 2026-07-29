CREATE OR REPLACE FUNCTION "scrub_retained_ai_ask_commands_for_deleted_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "ai_ask_commands"
  SET
    "status" = 'discarded',
    "terminal_result" = jsonb_build_object(
      'type', 'error',
      'code', 'refresh_required',
      'errorMessage', 'Nội dung lập kế hoạch đã thay đổi. Vui lòng làm mới và gửi lại câu hỏi để nhận câu trả lời phù hợp.'
    ),
    "terminal_at" = CURRENT_TIMESTAMP,
    "conversation_id" = NULL,
    "trip_project_id" = NULL,
    "conversation_lifecycle_version" = NULL,
    "trip_project_aggregate_version" = NULL,
    "user_message_id" = NULL,
    "assistant_message_id" = NULL,
    "normalized_question" = '[discarded]',
    "attachment_metadata" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "user_id" = OLD."user_id"
    AND (
      (TG_TABLE_NAME = 'conversations' AND "conversation_id" = OLD."id")
      OR (TG_TABLE_NAME = 'trip_projects' AND (
        "trip_project_id" = OLD."id"
        OR "conversation_id" IN (
          SELECT "id" FROM "conversations"
          WHERE "user_id" = OLD."user_id" AND "trip_project_id" = OLD."id"
        )
      ))
    );
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "conversations_scrub_retained_ai_ask_commands"
BEFORE DELETE ON "conversations"
FOR EACH ROW EXECUTE FUNCTION "scrub_retained_ai_ask_commands_for_deleted_scope"();
--> statement-breakpoint
CREATE TRIGGER "trip_projects_scrub_retained_ai_ask_commands"
BEFORE DELETE ON "trip_projects"
FOR EACH ROW EXECUTE FUNCTION "scrub_retained_ai_ask_commands_for_deleted_scope"();
