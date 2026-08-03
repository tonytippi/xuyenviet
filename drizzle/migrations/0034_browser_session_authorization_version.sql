ALTER TABLE "browser_sessions" ADD COLUMN "authorization_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "browser_sessions" ALTER COLUMN "authorization_version" DROP DEFAULT;
