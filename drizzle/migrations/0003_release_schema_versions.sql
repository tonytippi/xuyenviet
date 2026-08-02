CREATE TABLE "release_schema_versions" (
  "version" text PRIMARY KEY NOT NULL,
  "recorded_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "release_schema_versions_version_check" CHECK (length(btrim("version")) between 1 and 120)
);
