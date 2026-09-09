CREATE INDEX IF NOT EXISTS "idx_operation_logs_created_desc"
  ON "operation_logs" ("created_at" DESC, "id" DESC);
