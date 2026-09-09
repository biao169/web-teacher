-- Hot-path ordering indexes for public list pages.
-- This migration is append-only; the immutable initial migration remains unchanged.

CREATE INDEX "idx_profiles_visibility_active_sort"
  ON "profiles" ("visibility", "is_active", "sort_order", "id");

CREATE INDEX "idx_projects_visibility_start_date"
  ON "projects" ("visibility", "start_date" DESC, "sort_order", "id");

CREATE INDEX "idx_courses_visibility_semester"
  ON "courses" ("visibility", "semester" DESC, "sort_order", "id");
