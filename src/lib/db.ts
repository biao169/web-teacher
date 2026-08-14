import type { Row } from "../types";

export async function first<T = Row>(db: D1Database, sql: string, params: unknown[] = []): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) || null;
}

export async function all<T = Row>(db: D1Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results || [];
}

export async function run(db: D1Database, sql: string, params: unknown[] = []) {
  return db.prepare(sql).bind(...params).run();
}

export async function siteSettings(db: D1Database) {
  return first(db, "SELECT * FROM site_settings WHERE is_active = 1 ORDER BY id LIMIT 1");
}

export async function globalSettings(db: D1Database) {
  return first(db, "SELECT * FROM global_settings ORDER BY id LIMIT 1");
}

export async function navItems(db: D1Database) {
  const rows = await all(db, "SELECT * FROM navigation_items WHERE enabled = 1 ORDER BY display_order, id");
  if (rows.length) return rows;
  const total = Number((await first(db, "SELECT COUNT(*) AS count FROM navigation_items"))?.count || 0);
  if (total > 0) return [];
  return [
    { title: "首页", title_en: "Home", url_name: "home" },
    { title: "团队", title_en: "Team", url_name: "team" },
    { title: "论文", title_en: "Publications", url_name: "publications" },
    { title: "项目", title_en: "Projects", url_name: "projects" },
    { title: "新闻", title_en: "News", url_name: "news" },
    { title: "联系", title_en: "Contact", url_name: "contact" },
  ];
}
