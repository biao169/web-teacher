-- Optional display values for existing teacher platform links; no existing values are changed.
ALTER TABLE "profiles" ADD COLUMN "orcid_value" INTEGER CHECK ("orcid_value" IS NULL OR (typeof("orcid_value") = 'integer' AND "orcid_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "personal_homepage_value" INTEGER CHECK ("personal_homepage_value" IS NULL OR (typeof("personal_homepage_value") = 'integer' AND "personal_homepage_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "google_scholar_value" INTEGER CHECK ("google_scholar_value" IS NULL OR (typeof("google_scholar_value") = 'integer' AND "google_scholar_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "dblp_value" INTEGER CHECK ("dblp_value" IS NULL OR (typeof("dblp_value") = 'integer' AND "dblp_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "github_value" INTEGER CHECK ("github_value" IS NULL OR (typeof("github_value") = 'integer' AND "github_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "cnki_value" INTEGER CHECK ("cnki_value" IS NULL OR (typeof("cnki_value") = 'integer' AND "cnki_value" BETWEEN 0 AND 9007199254740991));
