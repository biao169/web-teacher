import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { all, first, run } from "../lib/db";
import { saveUpload } from "../lib/media";
import { tableMeta } from "../lib/schema";

export const apiRoutes = new Hono<AppEnv>();

apiRoutes.post("/messages", async (c) => {
  const form = await c.req.formData();
  if (String(form.get("website") || "")) return c.text("Invalid submission", 400);
  let attachmentKey = "";
  const attachment = form.get("attachment");
  if (attachment instanceof File && attachment.size > 0) {
    const saved = await saveUpload(c, attachment, "messages");
    attachmentKey = saved.key;
  }
  await run(c.env.DB, "INSERT INTO messages (name, email, message_type, subject, content, attachment_key) VALUES (?, ?, ?, ?, ?, ?)", [
    form.get("name"),
    form.get("email"),
    form.get("message_type") || "other",
    form.get("subject"),
    form.get("content"),
    attachmentKey,
  ]);
  return c.redirect("/contact?sent=1");
});

apiRoutes.post("/news/:slug/comments", async (c) => {
  const news = await first(c.env.DB, "SELECT id FROM news WHERE slug = ?", [c.req.param("slug")]);
  if (!news) return c.notFound();
  const form = await c.req.formData();
  await run(c.env.DB, "INSERT INTO news_comments (news_id, name, email, content) VALUES (?, ?, ?, ?)", [
    news.id,
    form.get("name"),
    form.get("email") || "",
    form.get("content"),
  ]);
  return c.redirect(`/news/${c.req.param("slug")}#comments`);
});

apiRoutes.get("/suggestions/:table/:field", async (c) => {
  const meta = tableMeta(c.req.param("table"));
  const field = c.req.param("field");
  if (!meta || !meta.fields.some((item) => item.name === field && item.suggest)) return c.json({ values: [] });
  const rows = await all(c.env.DB, `SELECT DISTINCT ${field} AS value FROM ${meta.name} WHERE ${field} <> '' ORDER BY ${field} LIMIT 100`);
  return c.json({ values: rows.map((row) => row.value) });
});

apiRoutes.get("/admin/duplicates/:table", async (c) => {
  if (!c.get("isAdmin")) return c.json({ ok: false, error: "forbidden" }, 403);
  const meta = tableMeta(c.req.param("table"));
  if (!meta?.duplicateFields?.length) return c.json({ ok: true, matches: [] });
  const id = c.req.query("id") || "";
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const field of meta.duplicateFields) {
    const value = (c.req.query(field) || "").trim();
    if (!value) continue;
    clauses.push(`${field} LIKE ?`);
    params.push(field === "doi" ? `%${cleanDoi(value) || value}%` : `%${value}%`);
  }
  if (!clauses.length) return c.json({ ok: true, matches: [] });
  const where = `(${clauses.join(" OR ")})`;
  if (id) {
    params.push(id);
  }
  const rows = await all(c.env.DB, `SELECT id, ${meta.titleField} AS title FROM ${meta.name} WHERE ${where}${id ? " AND id <> ?" : ""} ORDER BY id DESC LIMIT 10`, params);
  return c.json({ ok: true, matches: rows });
});

apiRoutes.post("/admin/upload", async (c) => {
  if (!c.get("isAdmin")) return c.json({ ok: false, error: "forbidden" }, 403);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ ok: false, error: "missing file" }, 400);
  const result = await saveUpload(c, file, String(form.get("category") || "library"));
  return c.json({ ok: true, ...result });
});

apiRoutes.post("/admin/translations/scan", async (c) => {
  if (!c.get("isAdmin")) return c.text("forbidden", 403);
  const count = await scanTranslations(c);
  return c.redirect(`/admin/tools?scanned=${count}`);
});

apiRoutes.post("/admin/translations/sync-manual", async (c) => {
  if (!c.get("isAdmin")) return c.text("forbidden", 403);
  const count = await syncManualTranslations(c);
  return c.redirect(`/admin/tools?synced=${count}`);
});

apiRoutes.post("/admin/media/cleanup-missing", async (c) => {
  if (!c.get("isAdmin")) return c.text("forbidden", 403);
  if (c.env.MEDIA) return c.redirect("/admin/media?cleanup=r2-skipped");
  await run(c.env.DB, "DELETE FROM media_assets WHERE object_key IS NULL OR object_key = ''");
  return c.redirect("/admin/media?cleanup=1");
});

apiRoutes.post("/admin/translations/manual", async (c) => {
  if (!c.get("isAdmin")) return c.text("forbidden", 403);
  const form = await c.req.formData();
  const id = String(form.get("id") || "");
  const translated = String(form.get("translated_text") || "");
  if (!id) return c.text("missing id", 400);
  await run(c.env.DB, "UPDATE translation_cache SET translated_text = ?, status = 'success', is_manual = 1, provider = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [translated, id]);
  return c.redirect("/admin/table/translation_cache");
});

apiRoutes.get("/admin/publications/:id/metadata-query", async (c) => {
  if (!c.get("isAdmin")) return c.json({ ok: false, error: "forbidden" }, 403);
  const row = await first(c.env.DB, "SELECT * FROM publications WHERE id = ?", [c.req.param("id")]);
  if (!row) return c.notFound();
  const query = cleanDoi(String(row.doi || row.source_citation || "")) || String(row.title || "");
  return c.json({
    ok: true,
    query,
    crossref_url: `https://api.crossref.org/works?query.title=${encodeURIComponent(query)}&rows=1`,
    openalex_url: `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=1`,
    note: "This endpoint only prepares external lookup URLs. It does not send site data to third-party services.",
  });
});

apiRoutes.post("/admin/publications/:id/apply-metadata", async (c) => {
  if (!c.get("isAdmin")) return c.text("forbidden", 403);
  const row = await first(c.env.DB, "SELECT * FROM publications WHERE id = ?", [c.req.param("id")]);
  if (!row) return c.notFound();
  const form = await c.req.formData();
  const fields = ["title", "authors", "venue", "year", "volume", "issue", "pages", "doi", "url", "abstract"];
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const field of fields) {
    const value = String(form.get(field) || "");
    if (!value) continue;
    updates.push(`${field} = ?`);
    params.push(value);
  }
  if (updates.length) {
    params.push(row.id);
    await run(c.env.DB, `UPDATE publications SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
    await run(c.env.DB, "INSERT INTO autofetch_logs (source, query, success, message, changes_json, publication_id) VALUES (?, ?, 1, ?, ?, ?)", [
      "manual",
      cleanDoi(String(form.get("doi") || row.doi || row.title || "")),
      "Metadata manually applied",
      JSON.stringify(Object.fromEntries(fields.map((field) => [field, form.get(field) || ""]))),
      row.id,
    ]);
  }
  return c.redirect(`/admin/table/publications/${row.id}`);
});

async function scanTranslations(c: Context<AppEnv>) {
  const sources: [string, string[]][] = [
    ["site_settings", ["site_name", "hero_title", "hero_subtitle", "seo_title", "seo_description", "footer_text"]],
    ["navigation_items", ["title"]],
    ["profiles", ["name", "title", "organization", "lab", "office", "bio"]],
    ["research_interests", ["name", "description"]],
    ["publications", ["title", "authors", "venue", "publication_type", "abstract"]],
    ["projects", ["name", "source", "summary"]],
    ["patents", ["name", "country", "patent_type", "summary"]],
    ["students", ["name", "degree", "category", "direction", "status"]],
    ["courses", ["name", "semester", "audience", "summary"]],
    ["news", ["title", "category", "content"]],
  ];
  let count = 0;
  for (const [table, fields] of sources) {
    const rows = await all(c.env.DB, `SELECT id, ${fields.join(", ")} FROM ${table} ORDER BY id LIMIT 500`);
    for (const row of rows) {
      for (const field of fields) {
        const text = String(row[field] || "").trim();
        if (!text || text.length > 1500) continue;
        const hash = await sha256(text);
        await run(c.env.DB, "INSERT OR IGNORE INTO translation_cache (source_hash, source_ref_key, source_text, source_refs, status) VALUES (?, ?, ?, ?, 'pending')", [
          hash,
          `${table}.${field}.${row.id}`,
          text,
          `${table}#${row.id}.${field}`,
        ]);
        count += 1;
      }
    }
  }
  return count;
}

async function syncManualTranslations(c: Context<AppEnv>) {
  const pairs: [string, string, string][] = [
    ["site_settings", "site_name", "site_name_en"],
    ["site_settings", "hero_title", "hero_title_en"],
    ["site_settings", "hero_subtitle", "hero_subtitle_en"],
    ["site_settings", "footer_text", "footer_text_en"],
    ["navigation_items", "title", "title_en"],
    ["profiles", "name", "name_en"],
    ["profiles", "title", "title_en"],
    ["profiles", "organization", "organization_en"],
    ["profiles", "lab", "lab_en"],
    ["profiles", "bio", "bio_en"],
    ["research_interests", "name", "name_en"],
    ["research_interests", "description", "description_en"],
    ["patents", "name", "name_en"],
    ["students", "name", "name_en"],
  ];
  let count = 0;
  for (const [table, sourceField, targetField] of pairs) {
    const rows = await all(c.env.DB, `SELECT id, ${sourceField}, ${targetField} FROM ${table} ORDER BY id LIMIT 500`);
    for (const row of rows) {
      const source = String(row[sourceField] || "").trim();
      const translated = String(row[targetField] || "").trim();
      if (!source || !translated) continue;
      const hash = await sha256(source);
      await run(c.env.DB, "INSERT OR REPLACE INTO translation_cache (source_hash, source_ref_key, source_text, source_lang, target_lang, translated_text, provider, status, is_manual, source_refs, updated_at) VALUES (?, ?, ?, 'zh-CN', 'en', ?, 'manual', 'success', 1, ?, CURRENT_TIMESTAMP)", [
        hash,
        `${table}.${sourceField}.${row.id}`,
        source,
        translated,
        `${table}#${row.id}.${sourceField}`,
      ]);
      count += 1;
    }
  }
  return count;
}

function cleanDoi(value: string) {
  const match = value.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0].replace(/[).,;]+$/, "") : "";
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
