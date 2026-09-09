CREATE TABLE IF NOT EXISTS "admin_mutation_guards" (
  "uid" TEXT PRIMARY KEY NOT NULL,
  "module" TEXT NOT NULL,
  "target_uid" TEXT NOT NULL,
  "expected_updated_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  CONSTRAINT "ck_admin_mutation_guards_uid" CHECK (length("uid") BETWEEN 1 AND 128),
  CONSTRAINT "ck_admin_mutation_guards_module" CHECK (length("module") BETWEEN 1 AND 128),
  CONSTRAINT "ck_admin_mutation_guards_target" CHECK (length("target_uid") BETWEEN 1 AND 2048),
  CONSTRAINT "ck_admin_mutation_guards_expected" CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', "expected_updated_at") = "expected_updated_at"),
  CONSTRAINT "ck_admin_mutation_guards_created" CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") = "created_at")
);

CREATE INDEX IF NOT EXISTS "idx_admin_mutation_guards_created_at"
  ON "admin_mutation_guards" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_profiles_admin_updated"
  ON "profiles" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_publications_admin_updated"
  ON "publications" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_projects_admin_updated"
  ON "projects" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_patents_admin_updated"
  ON "patents" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_students_admin_updated"
  ON "students" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_news_admin_updated"
  ON "news" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_courses_admin_updated"
  ON "courses" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_messages_admin_status_created"
  ON "messages" ("status", "created_at" DESC, "id" DESC);
