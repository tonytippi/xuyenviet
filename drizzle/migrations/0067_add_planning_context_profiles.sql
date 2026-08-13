CREATE TABLE "planning_context_profile_versions" (
  "id" text PRIMARY KEY NOT NULL, "version" integer NOT NULL, "definition" jsonb NOT NULL, "digest" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_context_profile_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "planning_context_profile_versions_digest_check" CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "planning_context_profile_versions_definition_check" CHECK (jsonb_typeof("definition") = 'object' AND octet_length("definition"::text) <= 65536)
);
CREATE UNIQUE INDEX "planning_context_profile_versions_version_idx" ON "planning_context_profile_versions" ("version");
CREATE UNIQUE INDEX "planning_context_profile_versions_digest_idx" ON "planning_context_profile_versions" ("digest");

CREATE TABLE "planning_context_policy_versions" (
  "id" text PRIMARY KEY NOT NULL, "version" integer NOT NULL, "definition" jsonb NOT NULL, "digest" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_context_policy_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "planning_context_policy_versions_digest_check" CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "planning_context_policy_versions_definition_check" CHECK (jsonb_typeof("definition") = 'object' AND octet_length("definition"::text) <= 65536)
);
CREATE UNIQUE INDEX "planning_context_policy_versions_version_idx" ON "planning_context_policy_versions" ("version");
CREATE UNIQUE INDEX "planning_context_policy_versions_digest_idx" ON "planning_context_policy_versions" ("digest");

CREATE TABLE "planning_context_value_schema_versions" (
  "id" text PRIMARY KEY NOT NULL, "key" text NOT NULL, "version" integer NOT NULL, "definition" jsonb NOT NULL, "digest" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_context_value_schema_versions_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  CONSTRAINT "planning_context_value_schema_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "planning_context_value_schema_versions_digest_check" CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "planning_context_value_schema_versions_definition_check" CHECK (jsonb_typeof("definition") = 'object' AND octet_length("definition"::text) <= 65536)
);
CREATE UNIQUE INDEX "planning_context_value_schema_versions_key_version_idx" ON "planning_context_value_schema_versions" ("key", "version");
CREATE UNIQUE INDEX "planning_context_value_schema_versions_digest_idx" ON "planning_context_value_schema_versions" ("digest");

INSERT INTO "planning_context_profile_versions" ("id", "version", "definition", "digest") VALUES
  ('planning-profile:v6', 6, '{"version":"planning-profile:v6","kinds":["accommodation","activity","food","itinerary","route_comparison"]}'::jsonb, '2782eb02f5e8673581d972d49c684529fdd1579ed9b798ba334b5c69c1a20a70');
INSERT INTO "planning_context_policy_versions" ("id", "version", "definition", "digest") VALUES
  ('planning-policy:v6', 6, '{"version":"planning-policy:v6","comparatorVersion":"planning-comparator:v6","maxNodes":100,"maxDeliverables":40,"maxDepth":12,"maxParents":1,"maxValues":10,"maxTextLength":2000,"maxIdentifierLength":128}'::jsonb, '7674469c7453a15a15db3c5f9f52d0fd69645dbe6c719ffc20f57400b598f310');
INSERT INTO "planning_context_value_schema_versions" ("id", "key", "version", "definition", "digest") VALUES
  ('activity-style:v1', 'activity_style', 1, '{"key":"activity_style","version":"activity-style:v1","type":"text"}'::jsonb, 'be3684ee08837759422abe0a90ccd52cbe3937bec7e4073c397523bd6524a8ff'),
  ('destination:v1', 'destination', 1, '{"key":"destination","version":"destination:v1","type":"text"}'::jsonb, '804574072717fa1b0fe187aae42c6ffff2d5e092d4f53b76fe3b052c5c97327c'),
  ('direction:v1', 'direction', 1, '{"key":"direction","version":"direction:v1","type":"text"}'::jsonb, '42e15c1f12e4cc0d4d559f45c0a0b9ab88b806e7b4330c0f1ab1e8322e70e7c7'),
  ('food-style:v1', 'food_style', 1, '{"key":"food_style","version":"food-style:v1","type":"text"}'::jsonb, '83bbdfe62c4116814146431af01ff0ab0a154de3472535c0a43eb63f3f45cfa5'),
  ('party:v1', 'party', 1, '{"key":"party","version":"party:v1","type":"text"}'::jsonb, '3ba010bffd84502360b55e5507c0127e2792600d3b9414d17682efdc05ff595a'),
  ('stay-style:v1', 'stay_style', 1, '{"key":"stay_style","version":"stay-style:v1","type":"text"}'::jsonb, 'b7248aca6092d4a5491183ff504942a7c0c6e64a633dc34626b604bdd8e23645'),
  ('transit-style:v1', 'transit_style', 1, '{"key":"transit_style","version":"transit-style:v1","type":"text"}'::jsonb, 'd90f1e542a7cf01dfa70a422482fffd064f2cbd8d126f18920a4451fdc13cc34'),
  ('vehicle:v1', 'vehicle', 1, '{"key":"vehicle","version":"vehicle:v1","type":"enum"}'::jsonb, 'f7782c86c6869d988f23a295e63c09eaf7e81053929480109eebedf86edf0724');

CREATE FUNCTION "reject_planning_context_version_record_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'planning context version records are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "planning_context_profile_versions_immutable" BEFORE UPDATE OR DELETE ON "planning_context_profile_versions" FOR EACH ROW EXECUTE FUNCTION "reject_planning_context_version_record_mutation"();
CREATE TRIGGER "planning_context_policy_versions_immutable" BEFORE UPDATE OR DELETE ON "planning_context_policy_versions" FOR EACH ROW EXECUTE FUNCTION "reject_planning_context_version_record_mutation"();
CREATE TRIGGER "planning_context_value_schema_versions_immutable" BEFORE UPDATE OR DELETE ON "planning_context_value_schema_versions" FOR EACH ROW EXECUTE FUNCTION "reject_planning_context_version_record_mutation"();
