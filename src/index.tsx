import { Hono } from "hono";
import type { AppEnv } from "./types";
import { attachUser } from "./lib/auth";
import { publicRoutes } from "./routes/public";
import { apiRoutes } from "./routes/api";
import { adminRoutes } from "./routes/admin";
import { all } from "./lib/db";

const app = new Hono<AppEnv>();

app.use("*", attachUser);
app.use("*", async (c, next) => {
  const requested = c.req.query("lang");
  c.set("lang", requested === "en" ? "en" : "zh");
  await next();
});
app.route("/api", apiRoutes);
app.route("/admin", adminRoutes);
app.get("/sitemap.xml", async (c) => {
  const siteUrl = String(c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
  const news = await all(c.env.DB, "SELECT slug, updated_at FROM news WHERE visibility = 'public' ORDER BY updated_at DESC");
  const paths = ["/", "/team", "/publications", "/featured-publications", "/projects", "/patents", "/students", "/courses", "/news", "/contact"];
  const urls = [
    ...paths.map((path) => `<url><loc>${siteUrl}${path}</loc></url>`),
    ...news.map((item) => `<url><loc>${siteUrl}/news/${xml(String(item.slug))}</loc><lastmod>${String(item.updated_at || "").slice(0, 10)}</lastmod></url>`),
  ];
  return c.text(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, 200, { "content-type": "application/xml" });
});
app.get("/robots.txt", (c) => {
  const origin = String(c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
  return c.text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, 200, { "content-type": "text/plain" });
});
app.get("/media/:key{.*}", async (c) => {
  if (!c.env.MEDIA) return c.text("R2 MEDIA is not configured", 404);
  const object = await c.env.MEDIA.get(c.req.param("key"));
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  return new Response(object.body, { headers });
});
app.route("/", publicRoutes);

export default app;

function xml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
