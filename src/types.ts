export type Bindings = {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  SITE_URL: string;
  PUBLIC_MEDIA_BASE_URL: string;
  ADMIN_EMAILS: string;
  LOCAL_ADMIN_TOKEN: string;
  TRANSLATION_PROVIDER: string;
  CROSSREF_ENDPOINT: string;
  OPENALEX_ENDPOINT: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    userEmail: string;
    isAdmin: boolean;
    lang: "zh" | "en";
  };
};

export type Row = Record<string, unknown>;
