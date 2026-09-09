-- Stage 3 technical cache generation table. Transaction ownership belongs to the migration runner.
CREATE TABLE "cache_generations" (
  "tag" TEXT PRIMARY KEY NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "ck_cache_generations_tag" CHECK (length(trim("tag")) > 0 AND length("tag") <= 128),
  CONSTRAINT "ck_cache_generations_generation" CHECK ("generation" >= 1 AND "generation" <= 9007199254740990),
  CONSTRAINT "ck_cache_generations_updated_at" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0))
) STRICT;
