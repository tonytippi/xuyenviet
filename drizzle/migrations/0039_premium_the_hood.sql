CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "source_capture_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text NOT NULL REFERENCES "sources"("id") ON DELETE RESTRICT,
  "version_sequence" integer NOT NULL,
  "capture_kind" text NOT NULL,
  "raw_text" text,
  "file_name" text,
  "mime_type" text,
  "byte_size" integer,
  "storage_key" text,
  "raw_metadata" jsonb,
  "content_hash" text NOT NULL,
  "captured_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "payload_deleted_at" timestamp,
  CONSTRAINT "source_capture_versions_sequence_check" CHECK ("version_sequence" >= 1),
  CONSTRAINT "source_capture_versions_hash_check" CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "source_capture_versions_kind_check" CHECK ("capture_kind" in ('url', 'facebook', 'youtube', 'copied_post', 'pasted_text', 'screenshot')),
  CONSTRAINT "source_capture_versions_text_length_check" CHECK ("raw_text" is null OR (length(btrim("raw_text")) > 0 AND char_length("raw_text") <= 120000)),
  CONSTRAINT "source_capture_versions_tombstone_shape_check" CHECK ("payload_deleted_at" is null OR ("raw_text" is null AND "file_name" is null AND "mime_type" is null AND "byte_size" is null AND "storage_key" is null AND "raw_metadata" is null)),
  CONSTRAINT "source_capture_versions_id_source_unique" UNIQUE ("id", "source_id"),
  CONSTRAINT "source_capture_versions_source_sequence_unique" UNIQUE ("source_id", "version_sequence")
);
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "current_capture_version_id" text;
--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD COLUMN "capture_version_id" text;
--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD COLUMN "capture_version_id" text;
--> statement-breakpoint
CREATE INDEX "source_capture_versions_source_captured_at_idx" ON "source_capture_versions" ("source_id", "captured_at");
--> statement-breakpoint
CREATE INDEX "source_capture_versions_retention_idx" ON "source_capture_versions" ("capture_kind", "captured_at") WHERE "payload_deleted_at" is null;
--> statement-breakpoint
CREATE INDEX "sources_current_capture_version_id_idx" ON "sources" ("current_capture_version_id");
--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_capture_version_id_idx" ON "facebook_capture_reviews" ("capture_version_id");
--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_capture_version_id_idx" ON "knowledge_extraction_jobs" ("capture_version_id");
--> statement-breakpoint
-- Normalize legacy text before hashing. Legacy metadata is deliberately omitted unless a
-- future migration can map it through the same typed allowlist used for new captures.
INSERT INTO "source_capture_versions" ("id", "source_id", "version_sequence", "capture_kind", "raw_text", "file_name", "mime_type", "byte_size", "storage_key", "raw_metadata", "content_hash", "captured_at", "created_at")
SELECT
  md5('source-capture-version:' || material."id"),
  material."source_id",
  1,
  source."kind",
  regexp_replace(normalize(replace(replace(material."raw_text", E'\r\n', E'\n'), E'\r', E'\n'), NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
  material."file_name", material."mime_type", material."byte_size", material."storage_key",
  NULL,
  encode(digest(regexp_replace(normalize(replace(replace(material."raw_text", E'\r\n', E'\n'), E'\r', E'\n'), NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'sha256'), 'hex'),
  material."created_at", material."created_at"
FROM "raw_source_material" material
JOIN "sources" source ON source."id" = material."source_id"
WHERE material."raw_text" IS NOT NULL
  AND length(regexp_replace(normalize(replace(replace(material."raw_text", E'\r\n', E'\n'), E'\r', E'\n'), NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g')) > 0
  AND char_length(regexp_replace(normalize(replace(replace(material."raw_text", E'\r\n', E'\n'), E'\r', E'\n'), NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g')) <= CASE WHEN source."kind" = 'youtube' THEN 120000 ELSE 20000 END;
--> statement-breakpoint
DO $$
DECLARE
  skipped_count integer;
BEGIN
  SELECT count(*) INTO skipped_count
  FROM "raw_source_material" material
  JOIN "sources" source ON source."id" = material."source_id"
  WHERE material."raw_text" IS NOT NULL
    AND (
      length(regexp_replace(normalize(replace(replace(material."raw_text", E'\r\n', E'\n'), E'\r', E'\n'), NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
      OR char_length(regexp_replace(normalize(replace(replace(material."raw_text", E'\r\n', E'\n'), E'\r', E'\n'), NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g')) > CASE WHEN source."kind" = 'youtube' THEN 120000 ELSE 20000 END
    );
  IF skipped_count > 0 THEN
    RAISE NOTICE 'source-capture migration skipped % unreadable or oversized legacy payload(s); affected sources have no current capture version.', skipped_count;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "sources" source
SET "current_capture_version_id" = version."id"
FROM "source_capture_versions" version
WHERE version."source_id" = source."id" AND version."version_sequence" = 1;
--> statement-breakpoint
UPDATE "facebook_capture_reviews" review
SET "capture_version_id" = version."id"
FROM "source_capture_versions" version
WHERE version."source_id" = review."source_id" AND version."version_sequence" = 1;
--> statement-breakpoint
UPDATE "knowledge_extraction_jobs" job
SET "capture_version_id" = version."id"
FROM "source_capture_versions" version
WHERE version."source_id" = job."source_id" AND version."version_sequence" = 1;
--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_current_capture_version_source_fk" FOREIGN KEY ("current_capture_version_id", "id") REFERENCES "source_capture_versions"("id", "source_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_capture_version_source_fk" FOREIGN KEY ("capture_version_id", "source_id") REFERENCES "source_capture_versions"("id", "source_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_capture_version_source_fk" FOREIGN KEY ("capture_version_id", "source_id") REFERENCES "source_capture_versions"("id", "source_id") ON DELETE RESTRICT;
