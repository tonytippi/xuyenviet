ALTER TABLE "trip_projects" ADD COLUMN "primary_conversation_id" text;--> statement-breakpoint

-- Repair legacy projects deterministically without touching historic conversation data.
WITH ranked_conversations AS (
  SELECT id, trip_project_id, user_id,
    row_number() OVER (PARTITION BY trip_project_id, user_id ORDER BY updated_at DESC, id DESC) AS rank
  FROM conversations
  WHERE trip_project_id IS NOT NULL
)
UPDATE trip_projects AS project
SET primary_conversation_id = ranked.id
FROM ranked_conversations AS ranked
WHERE project.id = ranked.trip_project_id
  AND project.user_id = ranked.user_id
  AND ranked.rank = 1
  AND project.primary_conversation_id IS NULL;--> statement-breakpoint

INSERT INTO conversations (id, user_id, trip_project_id, created_at, updated_at)
SELECT md5('trip-project-primary:' || project.id), project.user_id, project.id, now(), now()
FROM trip_projects AS project
WHERE project.primary_conversation_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM conversations AS conversation
    WHERE conversation.trip_project_id = project.id AND conversation.user_id = project.user_id
  );--> statement-breakpoint

UPDATE trip_projects AS project
SET primary_conversation_id = conversation.id
FROM conversations AS conversation
WHERE project.primary_conversation_id IS NULL
  AND conversation.trip_project_id = project.id
  AND conversation.user_id = project.user_id;--> statement-breakpoint

ALTER TABLE "trip_projects"
  ADD CONSTRAINT "trip_projects_primary_conversation_owner_fk"
  FOREIGN KEY ("primary_conversation_id", "id", "user_id")
  REFERENCES "conversations"("id", "trip_project_id", "user_id")
  ON DELETE SET NULL ("primary_conversation_id") ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
