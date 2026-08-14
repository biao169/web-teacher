import type { FC, PropsWithChildren } from "hono/jsx";
import { routeUrl } from "./url";
import { sanitizeHtml } from "./sanitize";

type Lang = "zh" | "en";

type LayoutProps = PropsWithChildren<{
  title: string;
  site: Record<string, unknown> | null;
  nav: Record<string, unknown>[];
  path?: string;
  lang?: Lang;
  admin?: boolean;
  scripts?: string[];
}>;

type AdminLayoutProps = PropsWithChildren<{
  title: string;
  site: Record<string, unknown> | null;
  path?: string;
  userEmail?: string;
  tables?: { name: string; label: string; count?: number }[];
  scripts?: string[];
}>;

export const Layout: FC<LayoutProps> = ({ title, site, nav, path = "/", lang = "zh", admin = false, scripts = [], children }) => {
  const siteName = pick(site, "site_name", lang) || (lang === "en" ? "Academic Website" : "科研教师个人主页");
  const logo = cleanKey(site?.logo_key);
  const footer = pick(site, "footer_text", lang) || siteName;
  return (
    <html lang={lang === "en" ? "en" : "zh-CN"}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} - ${siteName}` : siteName}</title>
        {site?.seo_description ? <meta name="description" content={String(site.seo_description)} /> : null}
        {site?.seo_keywords ? <meta name="keywords" content={String(site.seo_keywords)} /> : null}
        {site?.favicon_key ? <link rel="icon" href={`/media/${cleanKey(site.favicon_key)}`} /> : null}
        <link rel="stylesheet" href="/assets/site.css" />
      </head>
      <body class={admin ? "admin-shell" : ""}>
        <header class="site-header">
          <a class="brand" href={withLang("/", lang)}>
            {logo ? <img class="site-logo" src={`/media/${logo}`} alt={siteName} /> : null}
            <span>{siteName}</span>
          </a>
          <nav class="nav">
            {nav.map((item) => {
              const href = routeUrl(item.url_name, String(item.fragment || ""));
              return <a class={path === href ? "active" : ""} href={withLang(href, lang)}>{pick(item, "title", lang)}</a>;
            })}
          </nav>
          <div class="auth">
            <a class={lang === "zh" ? "active" : ""} href={withLang(path, "zh")}>中文</a>
            <a class={lang === "en" ? "active" : ""} href={withLang(path, "en")}>English</a>
            <a href="/admin">Admin</a>
          </div>
        </header>
        <main>{children}</main>
        <footer class="footer">
          <div class="footer-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(footer) }} />
        </footer>
        <button type="button" class="back-to-top" id="back-to-top" aria-label={lang === "en" ? "Back to top" : "返回顶部"} title={lang === "en" ? "Back to top" : "返回顶部"}>
          <span class="back-to-top-icon" aria-hidden="true">↑</span>
          <span class="back-to-top-text">{lang === "en" ? "Top" : "返回顶部"}</span>
        </button>
        <script src="/assets/site.js" type="module"></script>
        {scripts.map((src) => <script src={src}></script>)}
      </body>
    </html>
  );
};

export const AdminLayout: FC<AdminLayoutProps> = ({ title, site, path = "/admin", userEmail = "local-admin", tables = [], scripts = [], children }) => {
  const siteName = pick(site, "site_name", "zh") || "科研教师个人主页";
  const logo = cleanKey(site?.logo_key);
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} - 教师网站管理` : "教师网站管理"}</title>
        <link rel="stylesheet" href="/assets/site.css" />
      </head>
      <body class="admin-shell admin-console">
        <div class="admin-page">
          <aside class="admin-sidebar">
            <a class="admin-shared-brand" href="/admin">
              <span class="admin-shared-brand-mark">{logo ? <img src={`/media/${logo}`} alt={siteName} /> : "管"}</span>
              <span class="admin-shared-brand-text">
                <strong class="admin-shared-brand-title">{siteName}</strong>
                <span class="admin-shared-brand-subtitle">内容管理</span>
              </span>
            </a>
            <nav class="admin-side-nav">
              <a class={path === "/admin" ? "active" : ""} href="/admin">总览</a>
              <a class={path === "/admin/media" ? "active" : ""} href="/admin/media">媒体库</a>
              <a class={path === "/admin/tools" ? "active" : ""} href="/admin/tools">辅助工具</a>
              <a href="/sitemap.xml" target="_blank" rel="noreferrer">Sitemap</a>
            </nav>
            <div class="admin-side-section">
              <span>数据模型</span>
              {tables.map((item) => (
                <a class={path.includes(`/admin/table/${item.name}`) ? "active" : ""} href={`/admin/table/${item.name}`}>
                  <span>{item.label}</span>
                  {typeof item.count === "number" ? <small>{item.count}</small> : null}
                </a>
              ))}
            </div>
          </aside>
          <div class="admin-main">
            <header class="admin-topbar">
              <div>
                <span class="admin-kicker">Teacher Website</span>
                <h1>{title || "后台管理"}</h1>
              </div>
              <div class="admin-topbar-actions">
                <a class="button light" href="/" target="_blank" rel="noreferrer">查看前台</a>
                <span class="admin-user">{userEmail || "local-admin"}</span>
                <form method="post" action="/admin/logout"><button class="button light">退出</button></form>
              </div>
            </header>
            <main class="admin-content">{children}</main>
          </div>
        </div>
        <script src="/assets/site.js" type="module"></script>
        {scripts.map((src) => <script src={src} type="module"></script>)}
      </body>
    </html>
  );
};

function cleanKey(value: unknown) {
  return String(value || "").replace(/^\/+/, "");
}

function pick(row: Record<string, unknown> | null | undefined, field: string, lang: Lang) {
  const en = String(row?.[`${field}_en`] || "").trim();
  const zh = String(row?.[field] || "").trim();
  return lang === "en" && en ? en : zh;
}

function withLang(path: string, lang: Lang) {
  if (lang !== "en") return path;
  const [base, hash = ""] = path.split("#");
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}lang=en${hash ? `#${hash}` : ""}`;
}
