import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { all, first, navItems, run, siteSettings } from "../lib/db";
import { AdminLayout, Layout } from "../lib/html";
import { requireAdmin } from "../lib/auth";
import { mediaUrl } from "../lib/url";
import { fieldNames, tableMeta, tables, type FieldMeta, type TableMeta } from "../lib/schema";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get("/login", async (c) => {
  if (c.get("isAdmin")) return c.redirect("/admin");
  const shell = await adminShell(c, "管理员登录");
  const configured = Boolean(c.env.LOCAL_ADMIN_TOKEN);
  return c.html(
    <Layout {...shell} admin>
      <section class="form-card admin-login-card">
        <h1>管理员登录</h1>
        <p class="muted">{configured ? "请输入本地管理员 token。" : "当前未配置 LOCAL_ADMIN_TOKEN；请先在 .dev.vars 或 Cloudflare Worker 变量中配置。"}</p>
        <form method="post" action="/admin/login">
          <p><label>LOCAL_ADMIN_TOKEN</label><input name="token" type="password" autocomplete="current-password" required /></p>
          <button class="button">登录</button>
        </form>
      </section>
    </Layout>,
  );
});

adminRoutes.post("/login", async (c) => {
  const form = await c.req.formData();
  const token = String(form.get("token") || "");
  if (!c.env.LOCAL_ADMIN_TOKEN || token !== c.env.LOCAL_ADMIN_TOKEN) {
    const shell = await adminShell(c, "管理员登录");
    return c.html(
      <Layout {...shell} admin>
        <section class="form-card admin-login-card">
          <h1>管理员登录</h1>
          <p class="error">登录失败：token 不正确，或 LOCAL_ADMIN_TOKEN 尚未配置。</p>
          <form method="post" action="/admin/login">
            <p><label>LOCAL_ADMIN_TOKEN</label><input name="token" type="password" autocomplete="current-password" required /></p>
            <button class="button">重新登录</button>
          </form>
        </section>
      </Layout>,
      403,
    );
  }
  c.header("Set-Cookie", `local_admin_token=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=604800`);
  return c.redirect("/admin");
});

adminRoutes.post("/logout", (c) => {
  c.header("Set-Cookie", "local_admin_token=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0");
  return c.redirect("/admin/login");
});

adminRoutes.use("*", requireAdmin);

adminRoutes.get("/", async (c) => {
  const shell = await adminShell(c, "Admin");
  const counts = await Promise.all(
    tables.map(async (meta) => ({
      name: meta.name,
      label: meta.label,
      count: Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name}`))?.count || 0),
    })),
  );
  return c.html(
    <AdminLayout {...shell} tables={counts} userEmail={c.get("userEmail")}>
      <section class="admin-hero-panel">
        <div>
          <h2>内容管理</h2>
          <p>管理个人网站的导航、资料、论文、项目、专利、学生、课程、新闻、留言和翻译缓存。这个 Worker 版本保留 web01 后台的常用辅助能力，并适配 D1/R2。</p>
        </div>
        <div class="admin-toolbar">
          <a class="button" href="/admin/tools">辅助工具</a>
          <a class="button light" href="/admin/media">媒体库</a>
          <a class="button light" href="/admin/export/all">导出 JSON</a>
        </div>
      </section>
      <div class="grid admin-grid">
        {counts.map((item) => (
          <a class="admin-card admin-model-card" href={`/admin/table/${item.name}`}>
            <h3>{item.label}</h3>
            <p>{item.count} records</p>
            <span>{item.name}</span>
          </a>
        ))}
      </div>
    </AdminLayout>,
  );
});

adminRoutes.get("/table/:table", async (c) => {
  const meta = mustMeta(c);
  if (!meta) return c.notFound();
  const shell = await adminShell(c, meta.label);
  const q = c.req.query("q") || "";
  const { where, params } = buildAdminSearch(meta, q);
  const rows = await all(c.env.DB, `SELECT * FROM ${meta.name} ${where} ORDER BY id DESC LIMIT 300`, params);
  const overview = await tableOverview(c, meta, rows);
  return c.html(
    <AdminLayout {...shell} tables={await adminTableNav(c)} userEmail={c.get("userEmail")}>
      {overview}
      <section class="admin-card">
        <div class="admin-card-head">
          <div>
            <h2>{meta.label}</h2>
            <p>{rows.length} 条记录，最多显示 300 条</p>
          </div>
          <div class="admin-toolbar">
            <a class="button" href={`/admin/table/${meta.name}/new`}>新增</a>
            <a class="button light" href={`/admin/export/${meta.name}.csv`}>导出 CSV</a>
          </div>
        </div>
        <div class="admin-card-body">
          <form class="admin-filter-bar">
            <input name="q" value={q} placeholder="搜索当前模型：关键词 / id:12 / year:2024 / status:public" />
            <button>搜索</button>
            <a class="button light" href={`/admin/table/${meta.name}`}>重置</a>
          </form>
          <p class="admin-search-help">支持多个关键词组合搜索；也支持字段搜索，例如 <code>title:AI</code>、<code>year:2024</code>、<code>doi:10.</code>、<code>id:3</code>。多个条件会同时生效。</p>
          <form method="post" action={`/admin/import/${meta.name}`} enctype="multipart/form-data" class="admin-inline-form">
            <input type="file" name="file" accept=".csv" required />
            <button>导入 CSV</button>
          </form>
          {adminBulkActions(meta).length ? (
            <form method="post" action={`/admin/table/${meta.name}/bulk`} class="admin-inline-form admin-bulk-form">
              <select name="action" required>
                <option value="">选择批量操作</option>
                {adminBulkActions(meta).map((item) => <option value={item.value}>{item.label}</option>)}
              </select>
              <input name="ids" placeholder="记录 ID，用英文逗号分隔；留空表示当前筛选结果" />
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <button data-confirm="确认执行批量操作？">执行</button>
            </form>
          ) : null}
          <div class="admin-table-wrap">
            <table class="admin-smart-table">
              <thead>
                <tr>
                  {meta.name === "media_assets" ? <th>预览</th> : null}
                  <th>ID</th>
                  {meta.listFields.map((field) => <th>{field}</th>)}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr>
                    {meta.name === "media_assets" ? <td>{mediaPreviewCell(row, c.env)}</td> : null}
                    <td>{String(row.id || "")}</td>
                    {meta.listFields.map((field) => <td>{cellValue(row[field], field, c.env, row)}</td>)}
                    <td class="row-actions">
                      <a href={`/admin/table/${meta.name}/${row.id}`}>编辑</a>
                      <form method="post" action={`/admin/table/${meta.name}/${row.id}/delete`} onsubmit="return confirm('确认删除这条记录？')">
                        <button class="link-button">删除</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AdminLayout>,
  );
});

adminRoutes.get("/table/:table/new", async (c) => editForm(c, null));
adminRoutes.get("/table/:table/:id", async (c) => {
  const meta = mustMeta(c);
  if (!meta) return c.notFound();
  const row = await first(c.env.DB, `SELECT * FROM ${meta.name} WHERE id = ?`, [c.req.param("id")]);
  return editForm(c, row);
});

adminRoutes.post("/table/:table/save", async (c) => {
  const meta = mustMeta(c);
  if (!meta) return c.notFound();
  const form = await c.req.formData();
  const id = String(form.get("id") || "");
  if (meta.name === "navigation_items" && !String(form.get("url_name") || "").trim()) {
    return c.text("导航栏 url_name 不能为空。请填写 home、team、publications、projects 等路由名称。", 400);
  }
  const names = fieldNames(meta.name);
  const values = names.map((name) => normalizeFormValue(form.get(name)));
  if (id) {
    const sets = names.map((name) => `${name} = ?`).join(", ");
    const updatedAt = hasColumn(meta, "updated_at") ? ", updated_at = CURRENT_TIMESTAMP" : "";
    await run(c.env.DB, `UPDATE ${meta.name} SET ${sets}${updatedAt} WHERE id = ?`, [...values, id]);
  } else {
    const placeholders = names.map(() => "?").join(", ");
    await run(c.env.DB, `INSERT INTO ${meta.name} (${names.join(", ")}) VALUES (${placeholders})`, values);
  }
  return c.redirect(`/admin/table/${meta.name}`);
});

adminRoutes.post("/table/:table/:id/delete", async (c) => {
  const meta = mustMeta(c);
  if (!meta) return c.notFound();
  await run(c.env.DB, `DELETE FROM ${meta.name} WHERE id = ?`, [c.req.param("id")]);
  return c.redirect(`/admin/table/${meta.name}`);
});

adminRoutes.post("/table/:table/:id/toggle-featured", async (c) => {
  const meta = mustMeta(c);
  if (!meta || !hasColumn(meta, "is_featured")) return c.notFound();
  const id = c.req.param("id");
  const row = await first(c.env.DB, `SELECT is_featured FROM ${meta.name} WHERE id = ?`, [id]);
  const next = Number(row?.is_featured || 0) ? 0 : 1;
  await run(c.env.DB, `UPDATE ${meta.name} SET is_featured = ? WHERE id = ?`, [next, id]);
  return c.redirect(`/admin/table/${meta.name}`);
});

adminRoutes.post("/table/:table/bulk", async (c) => {
  const meta = mustMeta(c);
  if (!meta) return c.notFound();
  const form = await c.req.formData();
  const action = String(form.get("action") || "");
  const ids = String(form.get("ids") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const q = String(form.get("q") || "");
  const targets = ids.length ? ids : await matchingIds(c, meta, q);
  if (!targets.length) return c.redirect(`/admin/table/${meta.name}`);
  await applyBulkAction(c, meta, action, targets);
  return c.redirect(`/admin/table/${meta.name}?updated=${targets.length}`);
});

adminRoutes.get("/media", async (c) => {
  const shell = await adminShell(c, "媒体库");
  const rows = await all(c.env.DB, "SELECT * FROM media_assets ORDER BY uploaded_at DESC LIMIT 500");
  return c.html(
    <AdminLayout {...shell} tables={await adminTableNav(c)} userEmail={c.get("userEmail")}>
      <section class="admin-card">
        <div class="admin-card-head">
          <div>
            <h2>媒体库</h2>
            <p>管理站点图片、PDF、附件和 R2/本地媒体 key。</p>
          </div>
          <div class="admin-toolbar">
            <a class="button light" href="/admin/table/media_assets">媒体数据表</a>
          </div>
        </div>
        <div class="admin-card-body">
      <section class="form-panel">
        <h2>上传媒体</h2>
        <form method="post" action="/api/admin/upload" enctype="multipart/form-data">
          <input type="file" name="file" required />
          <input name="category" placeholder="分类，例如 profile/news/publications" />
          <button>上传</button>
        </form>
        <p class="muted">本地开发时，可把文件放到 public/media，并创建同名 object_key 的 media_assets 记录；部署后再切换到 R2。</p>
      </section>
      <div class="media-grid">
        {rows.map((row) => (
          <article class="media-card">
            {isImage(row.mime_type, row.object_key) ? <img src={mediaUrl(row.object_key, c.env)} alt="" /> : <div class="file-tile">{fileKind(row.object_key)}</div>}
            <h3>{String(row.title || row.object_key)}</h3>
            <code>{String(row.object_key)}</code>
            <p>{String(row.category || "")} · {formatBytes(Number(row.size || 0))}</p>
            <a href={mediaUrl(row.object_key, c.env)} target="_blank" rel="noreferrer">打开</a>
          </article>
        ))}
      </div>
        </div>
      </section>
    </AdminLayout>,
  );
});

adminRoutes.get("/tools", async (c) => {
  const shell = await adminShell(c, "辅助工具");
  return c.html(
    <AdminLayout {...shell} tables={await adminTableNav(c)} userEmail={c.get("userEmail")}>
      <div class="grid">
        <section class="card">
          <h3>翻译缓存</h3>
          <p>扫描核心记录并生成待处理翻译缓存。默认手动处理，不会自动把站点私有文本发送到第三方。</p>
          <form method="post" action="/api/admin/translations/scan"><button>扫描文本</button></form>
          <a href="/admin/table/translation_cache">编辑翻译</a>
        </section>
        <section class="card">
          <h3>论文元数据</h3>
          <p>在论文编辑页解析引用文本、生成 Crossref/OpenAlex 查询链接，并在核对后填入表单。</p>
          <a href="/admin/table/publications">打开论文管理</a>
        </section>
        <section class="card">
          <h3>Sitemap</h3>
          <p>预览搜索引擎相关 XML 和 robots 配置。</p>
          <a href="/sitemap.xml">sitemap.xml</a>
          <a href="/robots.txt">robots.txt</a>
        </section>
      </div>
    </AdminLayout>,
  );
});

adminRoutes.get("/export/all", async (c) => {
  const payload: Record<string, unknown[]> = {};
  for (const meta of tables) payload[meta.name] = await all(c.env.DB, `SELECT * FROM ${meta.name} ORDER BY id`);
  return c.json(payload);
});

adminRoutes.get("/export/:table.csv", async (c) => {
  const meta = tableMeta(c.req.param("table") || "");
  if (!meta) return c.notFound();
  const rows = await all(c.env.DB, `SELECT * FROM ${meta.name} ORDER BY id`);
  const fields = ["id", ...fieldNames(meta.name)];
  return csvResponse(fields, rows, `${meta.name}.csv`);
});

adminRoutes.post("/import/:table", async (c) => {
  const meta = tableMeta(c.req.param("table"));
  if (!meta) return c.notFound();
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.text("Missing CSV file", 400);
  const rows = parseCsv(await file.text());
  const allowed = new Set(fieldNames(meta.name));
  let count = 0;
  for (const row of rows) {
    const names = Object.keys(row).filter((name) => allowed.has(name));
    if (!names.length) continue;
    const placeholders = names.map(() => "?").join(", ");
    await run(c.env.DB, `INSERT INTO ${meta.name} (${names.join(", ")}) VALUES (${placeholders})`, names.map((name) => row[name]));
    count += 1;
  }
  return c.redirect(`/admin/table/${meta.name}?imported=${count}`);
});

async function editForm(c: Context<AppEnv>, row: Record<string, unknown> | null) {
  const meta = mustMeta(c);
  if (!meta) return c.notFound();
  const shell = await adminShell(c, `${row ? "Edit" : "New"} ${meta.label}`);
  return c.html(
    <AdminLayout {...shell} tables={await adminTableNav(c)} userEmail={c.get("userEmail")} scripts={["/assets/admin.js"]}>
      <section class="admin-card">
        <div class="admin-card-head">
          <div>
            <h2>{row ? "编辑" : "新增"} {meta.label}</h2>
            <p>{row ? `记录 ID: ${String(row.id || "")}` : "创建一条新记录"}</p>
          </div>
          <div class="admin-toolbar">
            <button form="admin-edit-form" class="button">保存</button>
            <a class="button light" href={`/admin/table/${meta.name}`}>返回列表</a>
          </div>
        </div>
        <div class="admin-card-body">
          {meta.duplicateFields?.length ? <DuplicatePanel meta={meta} row={row} /> : null}
          {translationPairs(meta.name).length ? <TranslationPanel pairs={translationPairs(meta.name)} /> : null}
          {meta.name === "publications" ? <PublicationTools row={row} /> : null}
          <form id="admin-edit-form" class="form-panel admin-edit-form" method="post" action={`/admin/table/${meta.name}/save`}>
            <input type="hidden" name="id" value={String(row?.id || "")} />
            {meta.fields.map((field) => <FieldInput table={meta.name} field={field} value={row?.[field.name]} />)}
            <div class="admin-actions">
              <button>保存</button>
              <a class="button light" href={`/admin/table/${meta.name}`}>返回</a>
            </div>
          </form>
        </div>
      </section>
    </AdminLayout>,
  );
}

function FieldInput(props: { table: string; field: FieldMeta; value: unknown }) {
  const value = String(props.value ?? "");
  const suggest = props.field.suggest ? `${props.table}:${props.field.name}` : "";
  const common = { name: props.field.name, "data-suggest": suggest };
  return (
    <label>
      <span>{props.field.label}</span>
      {props.field.type === "textarea" ? (
        <textarea {...common}>{value}</textarea>
      ) : props.field.type === "select" ? (
        <select {...common}>
          {(props.field.choices || []).map((choice) => <option value={choice} selected={choice === value}>{choice || "-"}</option>)}
        </select>
      ) : (
        <input {...common} type={inputType(props.field)} value={value} />
      )}
    </label>
  );
}

function DuplicatePanel(props: { meta: TableMeta; row: Record<string, unknown> | null }) {
  return (
    <section class="duplicate-panel" data-duplicate-table={props.meta.name} data-duplicate-id={String(props.row?.id || "")} data-duplicate-fields={(props.meta.duplicateFields || []).join(",")}>
      <strong>查重</strong>
      <span>根据关键字段检查是否已经存在相似记录。</span>
      <button type="button" data-duplicate-run>立即查重</button>
      <div data-duplicate-result></div>
    </section>
  );
}

function TranslationPanel(props: { pairs: { source: string; target: string; label: string }[] }) {
  return (
    <section class="translate-tool" data-translation-pairs={JSON.stringify(props.pairs)}>
      <div class="translate-tool-head">
        <div>
          <h2>中英文翻译工具</h2>
          <p>把左侧中文字段翻译到右侧英文/目标字段，保存前仍可人工修正。</p>
        </div>
        <button type="button" class="button light" data-translate-all>翻译到目标字段</button>
      </div>
      <div class="translate-tool-grid">
        {props.pairs.map((pair) => <span>{pair.label}</span>)}
      </div>
      <div class="translate-status" data-translate-status></div>
    </section>
  );
}

function PublicationTools(props: { row: Record<string, unknown> | null }) {
  return (
    <section class="publication-metadata-tools" data-publication-id={String(props.row?.id || "")}>
      <div>
        <strong>论文信息快捷处理</strong>
        <span>解析粘贴的引用原文、检查重复、生成外部元数据查询链接；结果只填入当前表单，核对后再保存。</span>
        <em id="publication-tool-status" aria-live="polite"></em>
      </div>
      <div class="publication-metadata-actions">
        <button type="button" data-parse-citation>解析引用原文</button>
        <button type="button" data-metadata-query>生成元数据查询</button>
      </div>
    </section>
  );
}

function translationPairs(table: string) {
  const map: Record<string, { source: string; target: string; label: string }[]> = {
    site_settings: [
      { source: "site_name", target: "site_name_en", label: "网站名称" },
      { source: "hero_title", target: "hero_title_en", label: "首页标题" },
      { source: "hero_subtitle", target: "hero_subtitle_en", label: "首页副标题" },
      { source: "footer_text", target: "footer_text_en", label: "网站页脚" },
    ],
    navigation_items: [{ source: "title", target: "title_en", label: "导航标题" }],
    profiles: [
      { source: "name", target: "name_en", label: "姓名" },
      { source: "title", target: "title_en", label: "职称" },
      { source: "organization", target: "organization_en", label: "单位" },
      { source: "lab", target: "lab_en", label: "实验室" },
      { source: "bio", target: "bio_en", label: "简介" },
    ],
    research_interests: [
      { source: "name", target: "name_en", label: "方向名称" },
      { source: "description", target: "description_en", label: "方向描述" },
    ],
    patents: [{ source: "name", target: "name_en", label: "专利名称" }],
    students: [{ source: "name", target: "name_en", label: "学生姓名" }],
  };
  return map[table] || [];
}

function inputType(field: FieldMeta) {
  if (field.type === "number") return "number";
  if (field.type === "date") return "date";
  if (field.type === "datetime") return "datetime-local";
  if (field.type === "email") return "email";
  if (field.type === "url") return "url";
  return "text";
}

async function adminShell(c: Context<AppEnv>, title: string) {
  return { title, site: await siteSettings(c.env.DB), nav: await navItems(c.env.DB), path: c.req.path };
}

async function adminTableNav(c: Context<AppEnv>) {
  return Promise.all(
    tables.map(async (meta) => ({
      name: meta.name,
      label: meta.label,
      count: Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name}`))?.count || 0),
    })),
  );
}

async function tableOverview(c: Context<AppEnv>, meta: TableMeta, rows: Record<string, unknown>[]) {
  const total = Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name}`))?.count || 0);
  const stats: { label: string; value: string; detail?: string }[] = [{ label: "总记录", value: String(total), detail: rows.length === total ? "全部显示" : `当前显示 ${rows.length} 条` }];
  if (hasColumn(meta, "visibility")) {
    const visible = Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name} WHERE visibility = 'public'`))?.count || 0);
    stats.push({ label: "公开内容", value: String(visible), detail: `${Math.max(total - visible, 0)} 条非公开` });
  }
  if (hasColumn(meta, "is_featured")) {
    const featured = Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name} WHERE is_featured = 1`))?.count || 0);
    stats.push({ label: "甄选/推荐", value: String(featured), detail: "可批量调整" });
  }
  if (hasColumn(meta, "enabled")) {
    const enabled = Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name} WHERE enabled = 1`))?.count || 0);
    stats.push({ label: "已启用", value: String(enabled), detail: `${Math.max(total - enabled, 0)} 条停用` });
  }
  if (hasColumn(meta, "is_active")) {
    const active = Number((await first(c.env.DB, `SELECT COUNT(*) AS count FROM ${meta.name} WHERE is_active = 1`))?.count || 0);
    stats.push({ label: "生效中", value: String(active), detail: `${Math.max(total - active, 0)} 条未生效` });
  }
  if (meta.name === "media_assets") {
    const images = Number((await first(c.env.DB, "SELECT COUNT(*) AS count FROM media_assets WHERE mime_type LIKE 'image/%' OR object_key LIKE '%.png' OR object_key LIKE '%.jpg' OR object_key LIKE '%.jpeg' OR object_key LIKE '%.webp'"))?.count || 0);
    const bytes = Number((await first(c.env.DB, "SELECT SUM(size) AS size FROM media_assets"))?.size || 0);
    stats.push({ label: "图片资源", value: String(images), detail: `总容量 ${formatBytes(bytes)}` });
  }
  if (meta.name === "messages") {
    const unread = Number((await first(c.env.DB, "SELECT COUNT(*) AS count FROM messages WHERE status IS NULL OR status = '' OR status = 'new'"))?.count || 0);
    stats.push({ label: "待处理留言", value: String(unread), detail: "建议及时回复" });
  }

  const latest = rows.slice(0, 4);
  return (
    <section class="admin-overview-panel">
      <div class="admin-overview-head">
        <div>
          <h2>{meta.label} 总览</h2>
          <p>在进入具体编辑前，先查看当前内容状态，并使用常用快捷操作。</p>
        </div>
        <div class="admin-quick-actions">
          <a class="button" href={`/admin/table/${meta.name}/new`}>新增记录</a>
          <a class="button light" href={`/admin/export/${meta.name}.csv`}>导出 CSV</a>
          {meta.name === "media_assets" ? <a class="button light" href="/admin/media">打开媒体库</a> : null}
          {meta.name === "translation_cache" ? <a class="button light" href="/admin/tools">翻译工具</a> : null}
        </div>
      </div>
      <div class="admin-stat-grid">
        {stats.map((item) => (
          <article class="admin-stat-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {item.detail ? <em>{item.detail}</em> : null}
          </article>
        ))}
      </div>
      {adminBulkActions(meta).length ? (
        <form method="post" action={`/admin/table/${meta.name}/bulk`} class="admin-quick-bulk">
          <span>快捷批量</span>
          <select name="action" required>
            <option value="">选择操作</option>
            {adminBulkActions(meta).map((item) => <option value={item.value}>{item.label}</option>)}
          </select>
          <input name="ids" placeholder="留空作用于当前筛选；也可输入 ID: 1,2,3" />
          <button data-confirm="确认执行快捷批量操作？">执行</button>
        </form>
      ) : null}
      {latest.length ? (
        <div class="admin-latest-grid">
          {latest.map((row) => (
            <a class="admin-latest-card" href={`/admin/table/${meta.name}/${row.id}`}>
              <strong>{String(row[meta.titleField] || row.title || row.name || `#${row.id}`)}</strong>
              <span>{meta.listFields.slice(0, 4).map((field) => compactText(row[field])).filter(Boolean).join(" · ")}</span>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function mustMeta(c: Context<AppEnv>) {
  return tableMeta(c.req.param("table") || "");
}

function hasColumn(meta: TableMeta, name: string) {
  return meta.fields.some((field) => field.name === name) || ["created_at", "updated_at"].includes(name);
}

function buildAdminSearch(meta: TableMeta, q: string) {
  const tokens = parseSearchTokens(q);
  const params: unknown[] = [];
  const clauses: string[] = [];
  for (const token of tokens) {
    const fieldMatch = token.match(/^([a-zA-Z_][\w]*):(.*)$/);
    if (fieldMatch) {
      const field = fieldMatch[1];
      const value = fieldMatch[2].trim();
      if (!value) continue;
      if (field === "id") {
        clauses.push("id = ?");
        params.push(value);
      } else if (hasColumn(meta, field)) {
        clauses.push(`${field} LIKE ?`);
        params.push(`%${value}%`);
      }
      continue;
    }
    if (!meta.searchFields.length) continue;
    clauses.push(`(${meta.searchFields.map((field) => `${field} LIKE ?`).join(" OR ")})`);
    params.push(...meta.searchFields.map(() => `%${token}%`));
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function parseSearchTokens(q: string) {
  const tokens: string[] = [];
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
  for (const match of q.matchAll(pattern)) {
    const token = (match[1] || match[2] || match[3] || "").trim();
    if (token) tokens.push(token);
  }
  return tokens;
}

function adminBulkActions(meta: TableMeta) {
  const actions: { value: string; label: string }[] = [];
  if (hasColumn(meta, "visibility")) actions.push({ value: "visibility_public", label: "设为公开" }, { value: "visibility_hidden", label: "设为隐藏" });
  if (hasColumn(meta, "is_featured")) actions.push({ value: "featured_on", label: "设为甄选/推荐" }, { value: "featured_off", label: "取消甄选/推荐" });
  if (meta.name === "messages") actions.push({ value: "message_read", label: "标记为已读" }, { value: "message_replied", label: "标记为已回复" }, { value: "message_archived", label: "标记为已归档" });
  if (meta.name === "translation_cache") actions.push({ value: "translation_manual", label: "标记人工修正" }, { value: "translation_auto", label: "取消人工修正" }, { value: "translation_success", label: "标记成功" }, { value: "translation_pending", label: "标记待处理" });
  return actions;
}

async function matchingIds(c: Context<AppEnv>, meta: TableMeta, q: string) {
  const { where, params } = buildAdminSearch(meta, q);
  const rows = await all(c.env.DB, `SELECT id FROM ${meta.name} ${where} ORDER BY id DESC LIMIT 300`, params);
  return rows.map((row) => String(row.id || "")).filter(Boolean);
}

async function applyBulkAction(c: Context<AppEnv>, meta: TableMeta, action: string, ids: string[]) {
  const placeholders = ids.map(() => "?").join(", ");
  if (!placeholders) return;
  const update = async (sql: string, prefix: unknown[] = []) => run(c.env.DB, `${sql} WHERE id IN (${placeholders})`, [...prefix, ...ids]);
  if (action === "visibility_public" && hasColumn(meta, "visibility")) return update(`UPDATE ${meta.name} SET visibility = ?`, ["public"]);
  if (action === "visibility_hidden" && hasColumn(meta, "visibility")) return update(`UPDATE ${meta.name} SET visibility = ?`, ["hidden"]);
  if (action === "featured_on" && hasColumn(meta, "is_featured")) return update(`UPDATE ${meta.name} SET is_featured = ?`, [1]);
  if (action === "featured_off" && hasColumn(meta, "is_featured")) return update(`UPDATE ${meta.name} SET is_featured = ?`, [0]);
  if (action === "message_read" && meta.name === "messages") return update("UPDATE messages SET status = ?", ["read"]);
  if (action === "message_replied" && meta.name === "messages") return update("UPDATE messages SET status = ?", ["replied"]);
  if (action === "message_archived" && meta.name === "messages") return update("UPDATE messages SET status = ?", ["archived"]);
  if (action === "translation_manual" && meta.name === "translation_cache") return update("UPDATE translation_cache SET is_manual = ?", [1]);
  if (action === "translation_auto" && meta.name === "translation_cache") return update("UPDATE translation_cache SET is_manual = ?", [0]);
  if (action === "translation_success" && meta.name === "translation_cache") return update("UPDATE translation_cache SET status = ?", ["success"]);
  if (action === "translation_pending" && meta.name === "translation_cache") return update("UPDATE translation_cache SET status = ?", ["pending"]);
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function cellValue(value: unknown, field: string, env: AppEnv["Bindings"], row?: Record<string, unknown>) {
  const text = String(value ?? "");
  if (field.endsWith("_key") || field === "object_key") {
    if (!text) return "";
    const mime = row?.mime_type || "";
    return (
      <div class="admin-media-cell">
        {isImage(mime, text) ? <img class="admin-media-thumb" src={mediaUrl(text, env)} alt="" loading="lazy" /> : <span class="admin-file-chip">{fileKind(text)}</span>}
        <a href={mediaUrl(text, env)} target="_blank" rel="noreferrer">{text}</a>
      </div>
    );
  }
  if (["visibility", "status", "enabled", "is_active", "is_featured"].includes(field)) {
    return <span class={`admin-status-pill admin-status-${text || "blank"}`}>{text || "未设置"}</span>;
  }
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function mediaPreviewCell(row: Record<string, unknown>, env: AppEnv["Bindings"]) {
  const key = String(row.object_key || "");
  if (!key) return "";
  return isImage(row.mime_type, key)
    ? <a class="admin-media-preview-link" href={mediaUrl(key, env)} target="_blank" rel="noreferrer"><img class="admin-media-thumb admin-media-thumb-large" src={mediaUrl(key, env)} alt="" loading="lazy" /></a>
    : <a class="admin-file-chip admin-file-chip-large" href={mediaUrl(key, env)} target="_blank" rel="noreferrer">{fileKind(key)}</a>;
}

function compactText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
}

function isImage(mime: unknown, key: unknown) {
  const value = `${mime || ""} ${key || ""}`.toLowerCase();
  return value.includes("image/") || /\.(png|jpe?g|gif|webp)$/.test(value);
}

function fileKind(key: unknown) {
  const ext = String(key || "").split(".").pop()?.toUpperCase() || "FILE";
  return ext.slice(0, 5);
}

function formatBytes(size: number) {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function csvResponse(fields: string[], rows: Record<string, unknown>[], filename: string) {
  const body = [fields.join(","), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(","))].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}
