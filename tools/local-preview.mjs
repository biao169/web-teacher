import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 8787);
const db = loadSeed();
let activeLang = "zh";

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  activeLang = url.searchParams.get("lang") === "en" ? "en" : "zh";
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/media/")) return serveStatic(url.pathname, res);
  if (url.pathname.startsWith("/api/")) return apiRoute(req, res, url);
  if (url.pathname.startsWith("/admin")) return adminRoute(req, res, url);
  if (url.pathname.startsWith("/news/")) return html(res, newsDetail(url.pathname.split("/").pop() || ""));
  const page = route(url);
  if (page) return html(res, page);
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(layout("Not found", "<h1>Not found</h1>"));
}).listen(port, "0.0.0.0", () => console.log(`web02 local preview: http://127.0.0.1:${port}`));

function route(url) {
  if (url.pathname === "/") return home();
  if (url.pathname === "/team") return team();
  if (url.pathname === "/publications") return publications(url);
  if (url.pathname === "/featured-publications") return publications(url, true);
  if (url.pathname === "/projects") return projects(url);
  if (url.pathname === "/patents") return patents(url);
  if (url.pathname === "/students") return students(url);
  if (url.pathname === "/courses") return courses();
  if (url.pathname === "/news") return newsList(url);
  if (url.pathname === "/contact") return contact();
  return "";
}

function home() {
  const s = first("site_settings") || { site_name: "科研教师个人主页" };
  const profile = first("profiles") || {};
  const pubs = featured("publications").length ? featured("publications") : rows("publications").slice(0, 6);
  return layout("", `
    <section class="scholar-hero">
      <div class="scholar-main">
        <div class="scholar-identity">${avatar(profile, "scholar-avatar", profile.name || s.site_name)}<div><p class="eyebrow">${esc(profile.organization || s.site_name || "")}</p><h1>${esc(profile.name || s.site_name || "")}</h1><p class="subtitle">${esc([profile.title, profile.lab].filter(Boolean).join(" · "))}</p></div></div>
        <div class="academic-profile">${paragraphs(profile.bio || s.hero_subtitle || "")}</div>
        <div class="hero-actions"><a class="button" href="/publications">查看论文</a><a class="button secondary" href="/team">团队成员</a><a class="button light" href="/contact">联系留言</a></div>
      </div>
      <aside class="scholar-side"><h2>学术档案</h2><dl>${profile.email ? `<dt>邮箱</dt><dd>${esc(profile.email)}</dd>` : ""}${profile.office ? `<dt>办公地点</dt><dd>${esc(profile.office)}</dd>` : ""}${profile.orcid ? `<dt>ORCID</dt><dd>${esc(profile.orcid)}</dd>` : ""}${profile.personal_homepage ? `<dt>主页</dt><dd><a href="${escAttr(profile.personal_homepage)}">个人主页</a></dd>` : ""}</dl>${profile.recruiting ? `<div class="recruiting-note"><strong>招生方向</strong><p>${esc(profile.recruiting)}</p></div>` : ""}</aside>
    </section>
    ${rows("research_interests").length ? `<section class="band"><div class="section-head"><h2>研究方向</h2></div><div class="tags">${rows("research_interests").map(item => `<span title="${escAttr(item.description || "")}">${esc(item.name || "")}</span>`).join("")}</div></section>` : ""}
    <section class="home-insights"><div class="home-panel home-publications"><div class="section-head"><h2>代表论文</h2><a href="/publications">全部</a></div><div class="home-feature-list">${pubs.map((item, i) => `<article class="home-feature-item"><span class="home-feature-index">${i + 1}</span><div class="home-feature-body"><p>${esc(citation(item))}</p><div class="home-feature-meta">${meta([item.year, item.venue, item.publication_type, item.index_type])}${item.doi ? `<a href="https://doi.org/${escAttr(item.doi)}">DOI</a>` : ""}</div></div></article>`).join("")}</div></div><div class="home-panel"><div class="section-head"><h2>最新动态</h2><a href="/news">全部</a></div><div class="home-news-list">${rows("news").slice(0, 4).map(item => `<article class="home-news-item"><time>${esc(dateOnly(item.published_at))}</time><a href="/news/${escAttr(item.slug)}">${esc(item.title)}</a></article>`).join("")}</div></div></section>
    <section class="grid-3"><div><h2>项目</h2>${lineItems(featured("projects"), "name")}</div><div><h2>专利</h2>${lineItems(featured("patents"), "name")}</div><div><h2>学生</h2>${lineItems(featured("students"), "name", "degree")}</div></section>
  `);
}

function team() {
  return layout("团队", `<section class="people-list">${rows("profiles").map(row => `<article class="person-card">${avatar(row, "person-avatar", row.name)}<div class="person-body"><div class="person-head"><h2>${esc(row.name)}</h2><span class="meta">${esc([row.title, row.organization].filter(Boolean).join(" · "))}</span></div><p class="person-summary" id="teacher-bio-${row.id}">${esc(row.bio || "暂未填写个人简介。")}</p><div class="person-links">${row.email ? `<span>${esc(row.email)}</span>` : ""}${row.personal_homepage ? `<a href="${escAttr(row.personal_homepage)}">主页</a>` : ""}${row.google_scholar ? `<a href="${escAttr(row.google_scholar)}">Scholar</a>` : ""}${row.github ? `<a href="${escAttr(row.github)}">GitHub</a>` : ""}<button type="button" class="summary-toggle" data-summary-toggle data-expanded="false" data-more="展开简介" data-less="收起简介" aria-controls="teacher-bio-${row.id}" aria-expanded="false" hidden>展开简介</button></div></div></article>`).join("")}</section>`, ["/assets/person-summary-toggle.js"]);
}

function publications(url, featuredOnly = false) {
  const q = url.searchParams.get("q") || "";
  const year = url.searchParams.get("year") || "";
  const type = url.searchParams.get("publication_type") || "";
  const role = url.searchParams.get("author_role") || "";
  const sort = url.searchParams.get("sort") || "";
  let sourceRows = rows("publications");
  if (featuredOnly) sourceRows = sourceRows.filter(row => Number(row.is_featured || 0));
  let pubs = sourceRows.filter(row => (!q || includesAny(row, ["title", "title_en", "authors", "venue", "doi", "keywords", "citation"], q)) && (!year || String(row.year) === year) && (!role || row.author_role === role));
  if (type) pubs = pubs.filter(row => publicationTypeMatches(row, type));
  pubs = pubs.sort((a, b) => sort === "year_asc" ? Number(a.year || 0) - Number(b.year || 0) : sort === "title" ? String(a.title || "").localeCompare(String(b.title || "")) : sort === "year_desc" ? Number(b.year || 0) - Number(a.year || 0) : String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const groups = groupPublications(pubs);
  return layout(featuredOnly ? "代表论文" : "论文成果", `
    <form class="filters filters-wide publication-filters" method="get">${activeLang === "en" ? `<input type="hidden" name="lang" value="en">` : ""}<input class="filter-search" name="q" value="${escAttr(q)}" placeholder="标题、作者、期刊、关键词"><input class="filter-year" name="year" value="${escAttr(year)}" placeholder="年份"><select class="filter-category" name="publication_type"><option value="">全部论文分类</option>${publicationTypeOptions(sourceRows).map(item => `<option value="${escAttr(item.value)}" ${item.value === type ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select><select class="filter-compact" name="author_role"><option value="">全部角色</option>${["first", "corresponding", "other"].map(value => `<option value="${value}" ${value === role ? "selected" : ""}>${roleLabel(value)}</option>`).join("")}</select><select class="filter-compact" name="sort"><option value="">最新添加</option><option value="year_desc" ${sort === "year_desc" ? "selected" : ""}>年份倒序</option><option value="year_asc" ${sort === "year_asc" ? "selected" : ""}>年份正序</option><option value="title" ${sort === "title" ? "selected" : ""}>题名</option></select><button>搜索</button></form>
    <section class="copy-toolbar"><label for="citation-style">引用格式</label><select id="citation-style"><option value="gbt">GB/T 7714</option><option value="apa">APA</option><option value="ieee">IEEE</option></select><button type="button" id="select-all-publications" class="button light">全选</button><button type="button" id="copy-selected-citations" class="button">复制所选</button><span id="copy-status" class="copy-status"></span></section>
    <section class="citation-list classified-list">${groups.map(group => `<h2 class="group-title">${esc(group.label)} <span>${group.items.length}</span></h2>${group.items.map(item => publicationItem(item, pubs.length - pubs.indexOf(item))).join("")}`).join("") || `<p class="empty">暂无可见论文。</p>`}</section>
  `, ["/assets/publications.js"]);
}

function publicationPage(title, items) {
  return layout(title, `<section class="copy-toolbar"><label for="citation-style">引用格式</label><select id="citation-style"><option value="gbt">GB/T 7714</option><option value="apa">APA</option><option value="ieee">IEEE</option></select><button type="button" id="select-all-publications" class="button light">全选</button><button type="button" id="copy-selected-citations" class="button">复制所选</button><span id="copy-status" class="copy-status"></span></section><section class="citation-list">${items.map((item, i) => publicationItem(item, items.length - i)).join("")}</section>`, ["/assets/publications.js"]);
}

function projects(url) {
  const q = url.searchParams.get("q") || "";
  const items = rows("projects").filter(row => !q || includesAny(row, ["name", "source", "fund_name", "summary"], q));
  return layout("科研项目", `<form class="filters" method="get"><input name="q" value="${escAttr(q)}" placeholder="项目名称、基金、来源"><button>搜索</button></form>${copyToolbar("项目复制工具")}<section class="compact-list list-copy-scope">${items.map((item, i) => `<article class="compact-item list-copy-item" data-copy-text="${escAttr(projectCopyText(item))}"><div class="item-index"><span class="item-number">${items.length - i}</span><input type="checkbox" class="list-copy-check"></div><div class="compact-body"><h2>${esc(item.name)}</h2><div class="compact-meta">${meta([item.status, item.source, item.fund_name, periodDisplay(item), item.project_number ? `项目号: ${item.project_number}` : "", item.amount ? `金额: ${item.amount} 万元` : ""])}</div>${item.summary ? `<p class="compact-summary">${esc(item.summary)}</p>` : ""}<button type="button" class="link-button list-copy-one">复制</button></div></article>`).join("")}</section>`, ["/assets/list-copy.js"]);
}

function patents(url) {
  const q = url.searchParams.get("q") || "";
  const selectedCountry = url.searchParams.get("country") || "";
  const selectedType = url.searchParams.get("patent_type") || "";
  const selectedAuth = url.searchParams.get("authorization") || "";
  const groupBy = normalizePatentGroup(url.searchParams.get("group_by") || "type");
  let items = rows("patents").filter(row => !q || includesAny(row, ["name", "inventors", "grant_number", "application_number", "country", "patent_type", "legal_status"], q));
  if (selectedCountry) items = items.filter(row => row.country === selectedCountry);
  if (selectedType) items = items.filter(row => patentTypeMatches(row, selectedType));
  if (selectedAuth) items = items.filter(row => patentAuthorizationKey(row) === selectedAuth);
  const groups = groupPatents(items, groupBy);
  return layout("专利成果", `<form class="filters filters-wide patent-filters" method="get"><input class="filter-search" name="q" value="${escAttr(q)}" placeholder="名称、发明人、授权号"><select class="filter-compact" name="country"><option value="">全部国别</option>${uniqueOptions(rows("patents"), "country").map(value => `<option value="${escAttr(value)}" ${value === selectedCountry ? "selected" : ""}>${esc(value)}</option>`).join("")}</select><select class="filter-category" name="patent_type"><option value="">全部类型</option>${patentTypeOptions(rows("patents")).map(item => `<option value="${escAttr(item.value)}" ${item.value === selectedType ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select><select class="filter-compact" name="authorization"><option value="">全部授权状态</option><option value="granted" ${selectedAuth === "granted" ? "selected" : ""}>已授权</option><option value="pending" ${selectedAuth === "pending" ? "selected" : ""}>申请/未授权</option></select><select class="filter-compact" name="group_by"><option value="type" ${groupBy === "type" ? "selected" : ""}>按类型分组</option><option value="country" ${groupBy === "country" ? "selected" : ""}>按国别分组</option><option value="authorization" ${groupBy === "authorization" ? "selected" : ""}>按授权状态分组</option></select><button>搜索</button></form>${copyToolbar("专利复制工具")}<section class="compact-list classified-list list-copy-scope">${groups.map(group => `<h2 class="group-title">${esc(group.label)} <span>${group.items.length}</span></h2>${group.items.map(item => patentItem(item, items.length - items.indexOf(item))).join("")}`).join("") || `<p class="empty">暂无可见专利。</p>`}</section>`, ["/assets/list-copy.js"]);
}

function students(url) {
  const status = url.searchParams.get("status") || "";
  const sort = url.searchParams.get("sort") || "level";
  const displays = db.student_category_displays || [];
  let people = rows("students").filter(row => !status || String(row.status || "").toLowerCase().includes(status.toLowerCase()));
  people = sortStudents(people, displays, sort);
  const groups = groupStudents(people, displays);
  return layout("学生团队", `<form class="filters" method="get"><input name="status" value="${escAttr(status)}" placeholder="在读、毕业、访问"><input type="hidden" name="sort" value="${escAttr(sort)}"><button>筛选</button></form><nav class="segmented sort-tabs">${studentSorts(status, sort)}</nav>${copyToolbar("学生信息复制工具")}<section class="people-list list-copy-scope">${groups.map(group => `<h2 class="group-title">${esc(group.label)}</h2>${group.items.map(studentItem).join("")}`).join("") || `<p class="empty">暂无可见学生信息。</p>`}</section>`, ["/assets/list-copy.js"]);
}

function courses() {
  return layout("教学工作", `<section class="cards">${rows("courses").map((item, i) => `<article class="card"><div class="item-number">${i + 1}</div><div class="meta">${esc([item.semester || "学期未填", item.audience].filter(Boolean).join(" · "))}</div><h2>${esc(item.name)}</h2>${item.summary ? `<p>${esc(item.summary)}</p>` : ""}<div class="links">${item.syllabus_key ? `<a href="/media/${escAttr(item.syllabus_key)}">教学大纲</a>` : ""}${item.material_key ? `<a href="/media/${escAttr(item.material_key)}">课件资料</a>` : ""}</div></article>`).join("") || `<p class="empty">暂无课程信息。</p>`}</section>`);
}

function newsList(url) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = 10;
  const allNews = rows("news");
  const items = allNews.slice((page - 1) * pageSize, page * pageSize);
  return layout("新闻动态", `<section class="news-list">${items.map((item, i) => `<article class="news-row" id="news-${item.id}"><div class="item-number">${(page - 1) * pageSize + i + 1}</div><a class="news-cover ${item.cover_key ? "" : "placeholder"}" href="/news/${escAttr(item.slug)}">${item.cover_key ? `<img src="/media/${escAttr(item.cover_key)}" alt="${escAttr(item.title)}">` : `<span>${esc(String(item.title || "").slice(0, 1))}</span>`}</a><div class="news-content"><div class="news-meta-line"><time>${esc(dateOnly(item.published_at))}</time>${item.category ? `<span>${esc(item.category)}</span>` : ""}</div><h2><a href="/news/${escAttr(item.slug)}">${esc(item.title)}</a></h2><p class="news-excerpt">${esc(stripHtml(item.content).slice(0, 120))}</p></div></article>`).join("")}</section><nav class="pagination">${page > 1 ? `<a href="?page=${page - 1}">上一页</a>` : ""}<span>第 ${page} 页</span>${page * pageSize < allNews.length ? `<a href="?page=${page + 1}">下一页</a>` : ""}</nav>`);
}

function newsDetail(slug) {
  const row = rows("news").find(item => item.slug === slug);
  if (!row) return layout("Not found", "<h1>Not found</h1>");
  return layout(row.title, `<article class="article news-detail-article"><a class="back-link" href="/news">返回新闻列表</a><h1>${esc(row.title)}</h1><p class="meta">${esc([row.category, dateOnly(row.published_at)].filter(Boolean).join(" · "))}</p>${row.cover_key ? `<img class="cover" src="/media/${escAttr(row.cover_key)}" alt="">` : ""}<div class="content rich-content">${sanitizeNewsHtml(row.content || "")}${pdfBlocks(row.content || "")}</div></article><div class="comment-section-divider"><span></span></div><section class="comments"><h2>评论</h2>${Number(row.allow_comments || 0) ? `<details class="comment-composer"><summary><span class="comment-composer-icon">+</span><span><strong>提交评论</strong><small>展开后填写姓名、邮箱和评论内容</small></span></summary></details>` : ""}</section>`);
}

function contact() {
  return layout("联系留言", `<section class="page-head"><h1>联系留言</h1><p>注册用户可留言；是否允许匿名留言由后台设置。</p></section><form class="form-card" method="post" action="/api/messages" enctype="multipart/form-data"><input name="website" tabindex="-1" autocomplete="off" class="hidden-field"><p><label>姓名</label><input name="name" required></p><p><label>邮箱</label><input name="email" type="email" required></p><p><label>留言类型</label><select name="message_type"><option value="recruiting">招生咨询</option><option value="cooperation">合作交流</option><option value="paper">论文咨询</option><option value="project">项目咨询</option><option value="course">课程咨询</option><option value="other">其他</option></select></p><p><label>主题</label><input name="subject" required></p><p><label>内容</label><textarea name="content" required></textarea></p><p><label>附件</label><span class="file-control"><input id="attachment" name="attachment" type="file"><button class="button light file-control-button" type="button" id="attachment-picker-button">选择附件</button><span class="file-control-name" data-empty="未选择文件">未选择文件</span></span></p><button class="button">提交留言</button></form>`);
}

function admin() {
  const cards = adminTables().map(table => `<a class="card admin-table-card" href="/admin/table/${escAttr(table.name)}"><h3>${esc(table.label)}</h3><p>${rowsRaw(table.name).length} records</p><small>${esc(table.name)}</small></a>`).join("");
  return adminLayout("后台管理", `<section class="admin-hero-panel"><div><h2>内容管理</h2><p>管理个人网站的导航、资料、论文、项目、专利、学生、课程、新闻、留言和翻译缓存。本地预览会把改动保存在当前 Node 进程内存中。</p></div><div class="admin-toolbar"><a class="button" href="/admin/export/all">导出 JSON</a><form method="post" action="/admin/logout"><button class="button light">退出</button></form></div></section><div class="grid admin-grid">${cards.replaceAll('class="card admin-table-card"', 'class="admin-card admin-model-card"')}</div>`);
}

async function adminRoute(req, res, url) {
  if (url.pathname === "/admin/login" && req.method === "GET") return html(res, adminLogin());
  if (url.pathname === "/admin/login" && req.method === "POST") {
    const form = new URLSearchParams(await bodyText(req));
    const token = form.get("token") || "";
    const expected = process.env.LOCAL_ADMIN_TOKEN || "local-preview";
    if (token !== expected) return html(res, adminLogin("登录失败：token 不正确。本地预览默认 token 是 local-preview。"), 403);
    res.writeHead(302, { location: "/admin", "set-cookie": "local_admin=1; Path=/admin; SameSite=Lax; Max-Age=604800" });
    res.end();
    return;
  }
  if (url.pathname === "/admin/logout" && req.method === "POST") {
    res.writeHead(302, { location: "/admin/login", "set-cookie": "local_admin=; Path=/admin; SameSite=Lax; Max-Age=0" });
    res.end();
    return;
  }
  if (!isLocalAdmin(req)) {
    res.writeHead(302, { location: "/admin/login" });
    res.end();
    return;
  }
  if (url.pathname === "/admin" || url.pathname === "/admin/") return html(res, admin());
  if (url.pathname === "/admin/export/all") return json(res, db);

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "admin" || parts[1] !== "table") return html(res, layout("Not found", "<h1>Not found</h1>"), 404);
  const table = tableMetaLocal(parts[2]);
  if (!table) return html(res, layout("Not found", "<h1>Unknown table</h1>"), 404);
  if (parts.length === 3 && req.method === "GET") return html(res, adminTable(table, url));
  if (parts[3] === "bulk" && req.method === "POST") {
    const form = new URLSearchParams(await bodyText(req));
    const action = form.get("action") || "";
    const ids = String(form.get("ids") || "").split(",").map(item => item.trim()).filter(Boolean);
    const q = form.get("q") || "";
    const targets = ids.length ? ids : matchingAdminIds(table, q);
    applyLocalBulkAction(table, action, targets);
    return redirect(res, `/admin/table/${table.name}?updated=${targets.length}`);
  }
  if (parts[3] === "new" && req.method === "GET") return html(res, adminEdit(table, null));
  if (parts[4] === "delete" && req.method === "POST") {
    db[table.name] = rowsRaw(table.name).filter(row => String(row.id) !== parts[3]);
    return redirect(res, `/admin/table/${table.name}`);
  }
  if (parts[3] === "save" && req.method === "POST") {
    const form = new URLSearchParams(await bodyText(req));
    saveAdminRow(table, form);
    return redirect(res, `/admin/table/${table.name}`);
  }
  if (parts[3] && req.method === "GET") {
    const row = rowsRaw(table.name).find(item => String(item.id) === parts[3]);
    return html(res, adminEdit(table, row || null));
  }
  return html(res, layout("Not found", "<h1>Not found</h1>"), 404);
}

function adminLogin(error = "") {
  const expected = process.env.LOCAL_ADMIN_TOKEN || "local-preview";
  return layout("管理员登录", `<section class="form-card admin-login-card"><h1>管理员登录</h1>${error ? `<p class="error">${esc(error)}</p>` : ""}<p class="muted">本地预览 token：<code>${esc(expected)}</code>。部署到 Cloudflare 时请配置 LOCAL_ADMIN_TOKEN。</p><form method="post" action="/admin/login"><p><label>LOCAL_ADMIN_TOKEN</label><input name="token" type="password" required autocomplete="current-password"></p><button class="button">登录</button></form></section>`);
}

function apiRoute(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1] === "suggestions") {
    const table = tableMetaLocal(parts[2]);
    const field = parts[3];
    const values = table && field ? [...new Set(rowsRaw(table.name).map(row => String(row[field] || "").trim()).filter(Boolean))].sort().slice(0, 100) : [];
    return json(res, { values });
  }
  if (parts[0] === "api" && parts[1] === "admin" && parts[2] === "duplicates") {
    const table = tableMetaLocal(parts[3]);
    if (!table) return json(res, { ok: true, matches: [] });
    const id = url.searchParams.get("id") || "";
    const fields = duplicateFieldsLocal(table);
    const matches = rowsRaw(table.name)
      .filter(row => !id || String(row.id) !== id)
      .filter(row => fields.some(field => {
        const value = String(url.searchParams.get(field) || "").trim().toLowerCase();
        return value && String(row[field] || "").toLowerCase().includes(value);
      }))
      .slice(0, 10)
      .map(row => ({ id: row.id, title: row[table.listFields[0]] || row.title || row.name || row.id }));
    return json(res, { ok: true, matches });
  }
  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
}

function adminTable(table, url) {
  const q = url.searchParams.get("q") || "";
  let items = rowsRaw(table.name);
  if (q) items = items.filter(row => adminSearchMatches(table, row, q));
  const shown = items.slice().reverse().slice(0, 300);
  const previewHead = table.name === "media_assets" ? "<th>预览</th>" : "";
  const body = shown.map(row => `<tr>${table.name === "media_assets" ? `<td>${adminMediaPreview(row)}</td>` : ""}<td>${esc(row.id)}</td>${table.listFields.map(field => `<td>${adminCell(row[field], field, row)}</td>`).join("")}<td class="row-actions"><a href="/admin/table/${table.name}/${escAttr(row.id)}">编辑</a><form method="post" action="/admin/table/${table.name}/${escAttr(row.id)}/delete" onsubmit="return confirm('确认删除这条记录？')"><button class="link-button">删除</button></form></td></tr>`).join("");
  return adminLayout(table.label, `${adminTableOverview(table, shown)}<section class="admin-card"><div class="admin-card-head"><div><h2>${esc(table.label)}</h2><p>${items.length} 条记录，最多显示 300 条</p></div><div class="admin-toolbar"><a class="button" href="/admin/table/${table.name}/new">新增</a><a class="button light" href="/admin">返回后台</a></div></div><div class="admin-card-body"><form class="admin-filter-bar" method="get"><input name="q" value="${escAttr(q)}" placeholder="搜索当前模型：关键词 / id:12 / year:2024 / status:public"><button>搜索</button><a class="button light" href="/admin/table/${table.name}">重置</a></form><p class="admin-search-help">支持多个关键词组合搜索；也支持字段搜索，例如 <code>title:AI</code>、<code>year:2024</code>、<code>doi:10.</code>、<code>id:3</code>。多个条件会同时生效。</p>${cleanLocalBulkActions(table).length ? `<form method="post" action="/admin/table/${table.name}/bulk" class="admin-inline-form admin-bulk-form"><select name="action" required><option value="">选择批量操作</option>${cleanLocalBulkActions(table).map(item => `<option value="${escAttr(item.value)}">${esc(item.label)}</option>`).join("")}</select><input name="ids" placeholder="记录 ID，用英文逗号分隔；留空表示当前筛选结果">${q ? `<input type="hidden" name="q" value="${escAttr(q)}">` : ""}<button data-confirm="确认执行批量操作？">执行</button></form>` : ""}<div class="admin-table-wrap"><table class="admin-smart-table"><thead><tr>${previewHead}<th>ID</th>${table.listFields.map(field => `<th>${esc(field)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${body || `<tr><td colspan="${table.listFields.length + 2 + (table.name === "media_assets" ? 1 : 0)}">暂无数据</td></tr>`}</tbody></table></div></div></section>`, ["/assets/admin.js"]);
}

function adminEdit(table, row) {
  const title = `${row ? "编辑" : "新增"} ${table.label}`;
  const fields = table.fields.map(field => fieldInput(table.name, field, row?.[field.name])).join("");
  return adminLayout(title, `<section class="admin-card"><div class="admin-card-head"><div><h2>${esc(title)}</h2><p>${row ? `记录 ID: ${esc(row.id)}` : "创建一条新记录"}</p></div><div class="admin-toolbar"><button form="admin-edit-form" class="button">保存</button><a class="button light" href="/admin/table/${table.name}">返回列表</a></div></div><div class="admin-card-body">${duplicatePanel(table, row)}${translationPanel(table.name)}${table.name === "publications" ? publicationTools(row) : ""}<form id="admin-edit-form" class="form-panel admin-edit-form" method="post" action="/admin/table/${table.name}/save"><input type="hidden" name="id" value="${escAttr(row?.id || "")}">${fields}<div class="admin-actions"><button>保存</button><a class="button light" href="/admin/table/${table.name}">返回</a></div></form></div></section>`, ["/assets/admin.js"]);
}

function layout(title, body, scripts = []) {
  const s = first("site_settings") || { site_name: "科研教师个人主页" };
  const siteName = pickLang(s, "site_name") || "科研教师个人主页";
  const navRows = rowsRaw("navigation_items").length ? rowsRaw("navigation_items").filter(item => Number(item.enabled) === 1 && String(item.url_name || "").trim()) : [{ title: "首页", url_name: "home", enabled: 1 }];
  const navHtml = navRows.map(item => `<a href="${langHref(href(item.url_name))}">${esc(pickLang(item, "title"))}</a>`).join("");
  const logo = s.logo_key ? `<img class="site-logo" src="/media/${escAttr(s.logo_key)}" alt="${escAttr(siteName)}">` : "";
  return `<!doctype html><html lang="${activeLang === "en" ? "en" : "zh-CN"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title ? `${title} - ${siteName}` : siteName)}</title><link rel="stylesheet" href="/assets/site.css"></head><body><header class="site-header"><a class="brand" href="${langHref("/")}">${logo}<span>${esc(siteName)}</span></a><nav class="nav">${navHtml}</nav><div class="auth"><a href="/">中文</a><a href="?lang=en">English</a><a href="/admin">Admin</a></div></header><main>${body}</main><footer class="footer"><div class="footer-content">${sanitizeHtml(pickLang(s, "footer_text") || siteName)}</div></footer><button type="button" class="back-to-top" id="back-to-top" aria-label="返回顶部" title="返回顶部"><span class="back-to-top-icon">↑</span><span class="back-to-top-text">返回顶部</span></button><script src="/assets/site.js" type="module"></script>${scripts.map(src => `<script src="${src}"></script>`).join("")}</body></html>`;
}

function adminLayout(title, body, scripts = []) {
  const s = first("site_settings") || { site_name: "科研教师个人主页" };
  const siteName = s.site_name || "科研教师个人主页";
  const logo = s.logo_key ? `<img src="/media/${escAttr(s.logo_key)}" alt="${escAttr(siteName)}">` : "管";
  const modelLinks = adminTables().map(table => `<a href="/admin/table/${escAttr(table.name)}"><span>${esc(table.label)}</span><small>${rowsRaw(table.name).length}</small></a>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - 教师网站管理</title><link rel="stylesheet" href="/assets/site.css"></head><body class="admin-shell admin-console"><div class="admin-page"><aside class="admin-sidebar"><a class="admin-shared-brand" href="/admin"><span class="admin-shared-brand-mark">${logo}</span><span class="admin-shared-brand-text"><strong class="admin-shared-brand-title">${esc(siteName)}</strong><span class="admin-shared-brand-subtitle">内容管理</span></span></a><nav class="admin-side-nav"><a href="/admin">总览</a><a href="/admin/export/all">导出 JSON</a><a href="/" target="_blank" rel="noreferrer">查看前台</a></nav><div class="admin-side-section"><span>数据模型</span>${modelLinks}</div></aside><div class="admin-main"><header class="admin-topbar"><div><span class="admin-kicker">Teacher Website</span><h1>${esc(title)}</h1></div><div class="admin-topbar-actions"><a class="button light" href="/" target="_blank" rel="noreferrer">查看前台</a><span class="admin-user">local-preview</span><form method="post" action="/admin/logout"><button class="button light">退出</button></form></div></header><main class="admin-content">${body}</main></div></div><script src="/assets/site.js" type="module"></script>${scripts.map(src => `<script src="${src}" type="module"></script>`).join("")}</body></html>`;
}

function loadSeed() {
  const sql = readFileSync(join(root, "seed", "demo.sql"), "utf8");
  const data = {};
  const re = /INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/gi;
  for (const match of sql.matchAll(re)) {
    const table = match[1];
    if (!data[table]) data[table] = [];
    const columns = match[2].split(",").map(s => s.trim());
    for (const tuple of splitTuples(match[3])) {
      const values = splitValues(tuple);
      data[table].push(Object.fromEntries(columns.map((name, index) => [name, values[index] ?? ""])));
    }
  }
  return data;
}

function splitTuples(valuesText) {
  const tuples = [];
  let depth = 0, quote = false, start = -1;
  for (let i = 0; i < valuesText.length; i++) {
    const ch = valuesText[i], next = valuesText[i + 1];
    if (quote) {
      if (ch === "'" && next === "'") i++;
      else if (ch === "'") quote = false;
    } else if (ch === "'") quote = true;
    else if (ch === "(") { if (depth === 0) start = i + 1; depth++; }
    else if (ch === ")") { depth--; if (depth === 0 && start >= 0) tuples.push(valuesText.slice(start, i)); }
  }
  return tuples;
}

function splitValues(tuple) {
  const out = [];
  let cell = "", quote = false;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i], next = tuple[i + 1];
    if (quote) {
      if (ch === "'" && next === "'") { cell += "'"; i++; }
      else if (ch === "'") quote = false;
      else cell += ch;
    } else if (ch === "'") quote = true;
    else if (ch === ",") { out.push(clean(cell)); cell = ""; }
    else cell += ch;
  }
  out.push(clean(cell));
  return out;
}

function clean(value) {
  const text = value.trim();
  if (/^null$/i.test(text)) return "";
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function rows(table) { return (db[table] || []).filter(row => !("visibility" in row) || row.visibility === "public"); }
function rowsRaw(table) { if (!db[table]) db[table] = []; return db[table]; }
function first(table) { return (db[table] || [])[0]; }
function featured(table) { return rows(table).filter(row => Number(row.is_featured || 0)); }
function href(name) { return ({ home: "/", team: "/team", publications: "/publications", featured_publications: "/featured-publications", projects: "/projects", patents: "/patents", students: "/students", courses: "/courses", news: "/news", news_list: "/news", contact: "/contact" })[name] || "/"; }
function langHref(path) { return activeLang === "en" ? `${path}${path.includes("?") ? "&" : "?"}lang=en` : path; }
function pickLang(row, field) { return activeLang === "en" && row?.[`${field}_en`] ? row[`${field}_en`] : row?.[field]; }
function adminTables() {
  return Object.keys(db).filter(name => Array.isArray(db[name])).map(name => tableMetaLocal(name));
}
function tableMetaLocal(name) {
  if (!name || !Array.isArray(db[name])) return null;
  const rows = rowsRaw(name);
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => key !== "id" && !key.endsWith("_at"));
  const preferred = ["title", "name", "site_name", "authors", "year", "venue", "visibility", "is_featured", "enabled", "sort_order", "email", "status", "category", "url_name", "object_key"];
  const listFields = preferred.filter(field => keys.includes(field)).slice(0, 6);
  while (listFields.length < Math.min(5, keys.length)) {
    const next = keys.find(field => !listFields.includes(field));
    if (!next) break;
    listFields.push(next);
  }
  const searchFields = keys.filter(field => /(name|title|email|slug|authors|venue|keyword|summary|content|url|number|category|status)/i.test(field)).slice(0, 10);
  return {
    name,
    label: tableLabel(name),
    listFields,
    searchFields,
    fields: keys.map(field => ({ name: field, label: field, type: fieldType(field), choices: fieldChoices(field) })),
  };
}
function tableLabel(name) {
  return ({
    site_settings: "站点设置",
    global_settings: "全局设置",
    navigation_items: "导航栏",
    profiles: "个人资料",
    research_interests: "研究方向",
    publications: "论文成果",
    projects: "科研项目",
    patents: "专利软著",
    students: "学生团队",
    student_category_displays: "学生分类",
    courses: "教学课程",
    news: "新闻动态",
    comments: "评论",
    message_board_entries: "留言",
    media_assets: "媒体资源",
    translation_cache: "翻译缓存",
  })[name] || name;
}
function fieldType(field) {
  if (/(content|summary|bio|abstract|footer|description|citation|bibtex|keywords|members|awards|education|experience|recruiting)/i.test(field)) return "textarea";
  if (/(date$|_date$)/i.test(field)) return "date";
  if (/(email)/i.test(field)) return "email";
  if (/(url|homepage|link)/i.test(field)) return "url";
  if (/(amount|order|year|size|featured|active|enabled|allow|count|id)$/i.test(field)) return "number";
  return "text";
}
function fieldChoices(field) {
  if (field === "visibility" || field.endsWith("_visibility")) return ["public", "authenticated", "staff", "owner", "hidden"];
  if (field === "author_role") return ["", "first", "corresponding", "other"];
  return [];
}
function localBulkActions(table) {
  const keys = table.fields.map(field => field.name);
  const actions = [];
  if (keys.includes("visibility")) actions.push({ value: "visibility_public", label: "设为公开" }, { value: "visibility_hidden", label: "设为隐藏" });
  if (keys.includes("is_featured")) actions.push({ value: "featured_on", label: "设为甄选/推荐" }, { value: "featured_off", label: "取消甄选/推荐" });
  if (table.name === "messages") actions.push({ value: "message_read", label: "标记为已读" }, { value: "message_replied", label: "标记为已回复" }, { value: "message_archived", label: "标记为已归档" });
  if (table.name === "translation_cache") actions.push({ value: "translation_manual", label: "标记人工修正" }, { value: "translation_auto", label: "取消人工修正" }, { value: "translation_success", label: "标记成功" }, { value: "translation_pending", label: "标记待处理" });
  return actions;
}
function cleanLocalBulkActions(table) {
  const keys = table.fields.map(field => field.name);
  const actions = [];
  if (keys.includes("visibility")) actions.push({ value: "visibility_public", label: "设为公开" }, { value: "visibility_hidden", label: "设为隐藏" });
  if (keys.includes("is_featured")) actions.push({ value: "featured_on", label: "设为甄选/推荐" }, { value: "featured_off", label: "取消甄选/推荐" });
  if (table.name === "messages") actions.push({ value: "message_read", label: "标记为已读" }, { value: "message_replied", label: "标记为已回复" }, { value: "message_archived", label: "标记为已归档" });
  if (table.name === "translation_cache") actions.push({ value: "translation_manual", label: "标记人工修正" }, { value: "translation_auto", label: "取消人工修正" }, { value: "translation_success", label: "标记成功" }, { value: "translation_pending", label: "标记待处理" });
  return actions;
}
function adminTableOverview(table, shown) {
  const items = rowsRaw(table.name);
  const keys = table.fields.map(field => field.name);
  const stats = [{ label: "总记录", value: items.length, detail: `当前显示 ${shown.length} 条` }];
  if (keys.includes("visibility")) stats.push({ label: "公开内容", value: items.filter(row => row.visibility === "public").length, detail: `${items.filter(row => row.visibility !== "public").length} 条非公开` });
  if (keys.includes("is_featured")) stats.push({ label: "甄选/推荐", value: items.filter(row => Number(row.is_featured || 0)).length, detail: "可批量调整" });
  if (keys.includes("enabled")) stats.push({ label: "已启用", value: items.filter(row => Number(row.enabled || 0)).length, detail: "导航等开关" });
  if (keys.includes("is_active")) stats.push({ label: "生效中", value: items.filter(row => Number(row.is_active || 0)).length, detail: "当前有效配置" });
  if (table.name === "media_assets") stats.push({ label: "图片资源", value: items.filter(row => isAdminImage(row.mime_type, row.object_key)).length, detail: `总容量 ${formatBytesLocal(items.reduce((sum, row) => sum + Number(row.size || 0), 0))}` });
  const actions = cleanLocalBulkActions(table);
  const statHtml = stats.map(item => `<article class="admin-stat-card"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><em>${esc(item.detail || "")}</em></article>`).join("");
  const quick = actions.length ? `<form method="post" action="/admin/table/${table.name}/bulk" class="admin-quick-bulk"><span>快捷批量</span><select name="action" required><option value="">选择操作</option>${actions.map(item => `<option value="${escAttr(item.value)}">${esc(item.label)}</option>`).join("")}</select><input name="ids" placeholder="留空作用于当前筛选；也可输入 ID: 1,2,3"><button data-confirm="确认执行快捷批量操作？">执行</button></form>` : "";
  const latest = shown.slice(0, 4).map(row => `<a class="admin-latest-card" href="/admin/table/${table.name}/${escAttr(row.id)}"><strong>${esc(row[table.listFields[0]] || row.title || row.name || `#${row.id}`)}</strong><span>${esc(table.listFields.slice(0, 4).map(field => compactLocal(row[field])).filter(Boolean).join(" · "))}</span></a>`).join("");
  return `<section class="admin-overview-panel"><div class="admin-overview-head"><div><h2>${esc(table.label)} 总览</h2><p>在进入具体编辑前，先查看当前内容状态，并使用常用快捷操作。</p></div><div class="admin-quick-actions"><a class="button" href="/admin/table/${table.name}/new">新增记录</a><a class="button light" href="/admin/export/all">导出 JSON</a></div></div><div class="admin-stat-grid">${statHtml}</div>${quick}${latest ? `<div class="admin-latest-grid">${latest}</div>` : ""}</section>`;
}
function matchingAdminIds(table, q) {
  let items = rowsRaw(table.name);
  if (q) items = items.filter(row => adminSearchMatches(table, row, q));
  return items.slice(0, 300).map(row => String(row.id || "")).filter(Boolean);
}
function adminSearchMatches(table, row, q) {
  const tokens = parseAdminSearchTokens(String(q || ""));
  if (!tokens.length) return true;
  return tokens.every(token => {
    const match = token.match(/^([a-zA-Z_][\w]*):(.*)$/);
    if (match) {
      const field = match[1], value = match[2].toLowerCase();
      if (field === "id") return String(row.id || "") === match[2];
      return String(row[field] || "").toLowerCase().includes(value);
    }
    const value = token.toLowerCase();
    return table.searchFields.some(field => String(row[field] || "").toLowerCase().includes(value));
  });
}
function parseAdminSearchTokens(q) {
  const tokens = [];
  for (const match of q.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)) {
    const token = (match[1] || match[2] || match[3] || "").trim();
    if (token) tokens.push(token);
  }
  return tokens;
}
function applyLocalBulkAction(table, action, ids) {
  const selected = new Set(ids.map(String));
  rowsRaw(table.name).forEach(row => {
    if (!selected.has(String(row.id))) return;
    if (action === "visibility_public") row.visibility = "public";
    if (action === "visibility_hidden") row.visibility = "hidden";
    if (action === "featured_on") row.is_featured = 1;
    if (action === "featured_off") row.is_featured = 0;
    if (action === "message_read") row.status = "read";
    if (action === "message_replied") row.status = "replied";
    if (action === "message_archived") row.status = "archived";
    if (action === "translation_manual") row.is_manual = 1;
    if (action === "translation_auto") row.is_manual = 0;
    if (action === "translation_success") row.status = "success";
    if (action === "translation_pending") row.status = "pending";
    row.updated_at = new Date().toISOString();
  });
}
function fieldInput(table, field, value) {
  const val = String(value ?? "");
  const common = `name="${escAttr(field.name)}" data-suggest="${escAttr(table)}:${escAttr(field.name)}"`;
  if (field.choices?.length) return `<label><span>${esc(field.label)}</span><select ${common}>${field.choices.map(choice => `<option value="${escAttr(choice)}" ${choice === val ? "selected" : ""}>${esc(choice || "-")}</option>`).join("")}</select></label>`;
  if (field.type === "textarea") return `<label><span>${esc(field.label)}</span><textarea ${common}>${esc(val)}</textarea></label>`;
  return `<label><span>${esc(field.label)}</span><input ${common} type="${escAttr(field.type || "text")}" value="${escAttr(val)}"></label>`;
}
function duplicatePanel(table, row) {
  const fields = duplicateFieldsLocal(table).join(",");
  if (!fields) return "";
  return `<section class="duplicate-panel" data-duplicate-table="${escAttr(table.name)}" data-duplicate-id="${escAttr(row?.id || "")}" data-duplicate-fields="${escAttr(fields)}"><strong>查重</strong><span>根据关键字段检查是否已经存在相似记录。</span><button type="button" data-duplicate-run>立即查重</button><div data-duplicate-result></div></section>`;
}
function duplicateFieldsLocal(table) {
  const fields = table.fields.map(field => field.name);
  if (table.name === "publications") return ["title", "doi"].filter(field => fields.includes(field));
  if (table.name === "projects") return ["name", "project_number", "contract_number"].filter(field => fields.includes(field));
  if (table.name === "patents") return ["name", "application_number", "grant_number"].filter(field => fields.includes(field));
  if (table.name === "students") return ["name", "student_id", "email"].filter(field => fields.includes(field));
  if (table.name === "navigation_items") return ["title", "url_name"].filter(field => fields.includes(field));
  return table.searchFields.slice(0, 3);
}
function translationPanel(table) {
  const pairs = translationPairs(table);
  if (!pairs.length) return "";
  return `<section class="translate-tool" data-translation-pairs="${escAttr(JSON.stringify(pairs))}"><div class="translate-tool-head"><div><h2>中英文翻译工具</h2><p>把左侧中文字段翻译到右侧英文/目标字段，保存前仍可人工修正。</p></div><button type="button" class="button light" data-translate-all>翻译到目标字段</button></div><div class="translate-tool-grid">${pairs.map(pair => `<span>${esc(pair.label)}</span>`).join("")}</div><div class="translate-status" data-translate-status></div></section>`;
}
function publicationTools(row) {
  return `<section class="publication-metadata-tools" data-publication-id="${escAttr(row?.id || "")}"><div><strong>论文信息快捷处理</strong><span>解析粘贴的引用原文、检查重复、生成外部元数据查询链接；结果只填入当前表单，核对后再保存。</span><em id="publication-tool-status" aria-live="polite"></em></div><div class="publication-metadata-actions"><button type="button" data-parse-citation>解析引用原文</button><button type="button" data-metadata-query>生成元数据查询</button></div></section>`;
}
function translationPairs(table) {
  return ({
    site_settings: [{ source: "site_name", target: "site_name_en", label: "网站名称" }, { source: "hero_title", target: "hero_title_en", label: "首页标题" }, { source: "hero_subtitle", target: "hero_subtitle_en", label: "首页副标题" }, { source: "footer_text", target: "footer_text_en", label: "网站页脚" }],
    navigation_items: [{ source: "title", target: "title_en", label: "导航标题" }],
    profiles: [{ source: "name", target: "name_en", label: "姓名" }, { source: "title", target: "title_en", label: "职称" }, { source: "organization", target: "organization_en", label: "单位" }, { source: "lab", target: "lab_en", label: "实验室" }, { source: "bio", target: "bio_en", label: "简介" }],
    research_interests: [{ source: "name", target: "name_en", label: "方向名称" }, { source: "description", target: "description_en", label: "方向描述" }],
    patents: [{ source: "name", target: "name_en", label: "专利名称" }],
    students: [{ source: "name", target: "name_en", label: "学生姓名" }],
  })[table] || [];
}
function saveAdminRow(table, form) {
  const id = form.get("id") || "";
  if (table.name === "navigation_items" && !String(form.get("url_name") || "").trim()) return;
  const data = Object.fromEntries(table.fields.map(field => [field.name, normalizeAdminValue(form.get(field.name))]));
  if (id) {
    const row = rowsRaw(table.name).find(item => String(item.id) === String(id));
    if (row) Object.assign(row, data, { updated_at: new Date().toISOString() });
    return;
  }
  const maxId = rowsRaw(table.name).reduce((max, row) => Math.max(max, Number(row.id || 0)), 0);
  rowsRaw(table.name).push({ id: maxId + 1, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}
function normalizeAdminValue(value) {
  const text = String(value ?? "");
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}
function adminCell(value, field = "", row = {}) {
  const text = String(value ?? "");
  if (field.endsWith("_key") || field === "object_key" || /\.(png|jpe?g|gif|webp|pdf)$/i.test(text)) {
    if (!text) return "";
    const key = text.replace(/^\/?media\//, "");
    const preview = isAdminImage(row.mime_type, key) ? `<img class="admin-media-thumb" src="/media/${escAttr(key)}" alt="" loading="lazy">` : `<span class="admin-file-chip">${esc(fileKindLocal(key))}</span>`;
    return `<div class="admin-media-cell">${preview}<a href="/media/${escAttr(key)}" target="_blank">${esc(text)}</a></div>`;
  }
  if (["visibility", "status", "enabled", "is_active", "is_featured"].includes(field)) return `<span class="admin-status-pill admin-status-${escAttr(text || "blank")}">${esc(text || "未设置")}</span>`;
  return esc(text.length > 120 ? `${text.slice(0, 120)}...` : text);
}
function adminMediaPreview(row) {
  const key = String(row.object_key || "");
  if (!key) return "";
  return isAdminImage(row.mime_type, key)
    ? `<a class="admin-media-preview-link" href="/media/${escAttr(key)}" target="_blank"><img class="admin-media-thumb admin-media-thumb-large" src="/media/${escAttr(key)}" alt="" loading="lazy"></a>`
    : `<a class="admin-file-chip admin-file-chip-large" href="/media/${escAttr(key)}" target="_blank">${esc(fileKindLocal(key))}</a>`;
}
function isAdminImage(mime, key) {
  const value = `${mime || ""} ${key || ""}`.toLowerCase();
  return value.includes("image/") || /\.(png|jpe?g|gif|webp)$/.test(value);
}
function fileKindLocal(key) {
  return (String(key || "").split(".").pop() || "FILE").toUpperCase().slice(0, 5);
}
function formatBytesLocal(size) {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}
function compactLocal(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
}
function isLocalAdmin(req) {
  return String(req.headers.cookie || "").split(";").some(part => part.trim() === "local_admin=1");
}
function bodyText(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}
function json(res, data) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function avatar(row, className, label) { return row?.avatar_key ? `<img class="${className}" src="/media/${escAttr(row.avatar_key)}" alt="${escAttr(label || "")}" loading="lazy">` : `<div class="${className} placeholder">${esc(initial(label || ""))}</div>`; }
function lineItems(items, field, extra = "") { return items.length ? items.map(item => `<p class="line">${esc(item[field] || "")}${extra && item[extra] ? ` · ${esc(item[extra])}` : ""}</p>`).join("") : `<p class="empty">暂无内容。</p>`; }
function copyToolbar(label) { return `<section class="copy-toolbar" aria-label="${escAttr(label)}"><button type="button" class="button light list-select-all">全选</button><button type="button" class="button list-copy-selected">复制所选</button><span class="copy-status"></span></section>`; }
function publicationItem(item, index) { const text = citation(item); return `<article class="citation-item" data-citation-gbt="${escAttr(text)}" data-citation-apa="${escAttr(text)}" data-citation-ieee="${escAttr(text)}" data-citation-gbt-html="${escAttr(text)}" data-citation-apa-html="${escAttr(text)}" data-citation-ieee-html="${escAttr(text)}"><div class="citation-index"><span>${index}</span><input type="checkbox" class="publication-check"></div><div class="citation-body"><span class="citation-text">${esc(text)}</span><div class="citation-tools">${meta([item.year, item.publication_type, item.index_type, item.venue])}<button type="button" class="link-button copy-one-citation">复制</button>${item.doi ? `<a href="https://doi.org/${escAttr(item.doi)}">DOI</a>` : ""}${item.url ? `<a href="${escAttr(item.url)}">原文链接</a>` : ""}${item.pdf_key ? `<a href="/media/${escAttr(item.pdf_key)}">下载 PDF</a>` : ""}</div></div></article>`; }
function patentItem(item, index) { return `<article class="compact-item list-copy-item" data-copy-text="${escAttr(patentCopyText(item))}"><div class="item-index"><span class="item-number">${index}</span><input type="checkbox" class="list-copy-check"></div><div class="compact-body"><h2>${esc(item.name)}</h2><div class="compact-meta">${meta([item.country, item.patent_type, item.legal_status, item.application_number ? `申请号: ${item.application_number}` : "", item.application_date ? `申请日期: ${item.application_date}` : "", item.grant_number ? `授权号: ${item.grant_number}` : "", item.grant_date ? `授权日期: ${item.grant_date}` : ""])}</div>${item.inventors ? `<p class="compact-summary">发明人: ${esc(item.inventors)}</p>` : ""}${item.summary ? `<p class="compact-summary">${esc(item.summary)}</p>` : ""}<button type="button" class="link-button list-copy-one">复制</button></div></article>`; }
function studentItem(item) { return `<article class="person-card student-card list-copy-item" data-copy-text="${escAttr([item.name, item.degree, item.grade, item.direction, item.status, item.destination].filter(Boolean).join("; "))}"><div class="person-select"><input type="checkbox" class="list-copy-check"></div>${avatar(item, "person-avatar", item.name)}<div class="person-body"><div class="person-head"><h2>${esc(item.name)}</h2><span class="meta">${esc([item.status || "状态未填", item.degree, item.grade].filter(Boolean).join(" · "))}</span></div>${item.direction ? `<p class="person-summary">${esc(item.direction)}</p>` : ""}<div class="person-links">${item.destination ? `<span>去向: ${esc(item.destination)}</span>` : ""}${item.email ? `<span>${esc(item.email)}</span>` : ""}<button type="button" class="link-button list-copy-one">复制</button></div></div></article>`; }
function meta(values) { return values.filter(Boolean).map(value => `<span>${esc(value)}</span>`).join(""); }
function citation(row) { return row.citation || [row.authors, row.title, row.venue, row.year].filter(Boolean).join(". "); }
function projectCopyText(row) { return [row.name, row.status ? `状态: ${row.status}` : "", row.source ? `来源: ${row.source}` : "", row.fund_name ? `基金: ${row.fund_name}` : "", `周期: ${periodDisplay(row)}`, row.project_number ? `项目号: ${row.project_number}` : "", row.summary ? `简介: ${row.summary}` : ""].filter(Boolean).join("; "); }
function patentCopyText(row) { return [row.name, row.country ? `国家: ${row.country}` : "", row.patent_type ? `类型: ${row.patent_type}` : "", row.inventors ? `发明人: ${row.inventors}` : "", row.application_number ? `申请号: ${row.application_number}` : "", row.grant_number ? `授权号: ${row.grant_number}` : "", row.legal_status ? `状态: ${row.legal_status}` : ""].filter(Boolean).join("; "); }
function periodDisplay(row) { if (row.start_date && row.end_date) return `${String(row.start_date).slice(0, 10)} 至 ${String(row.end_date).slice(0, 10)}`; if (row.start_date) return `${String(row.start_date).slice(0, 10)} 起`; if (row.end_date) return `截至 ${String(row.end_date).slice(0, 10)}`; return "时间未填"; }
function includesAny(row, fields, q) { return fields.map(field => row[field]).join(" ").toLowerCase().includes(q.toLowerCase()); }
function uniqueOptions(items, field) { return [...new Set(items.map(row => String(row[field] || "").trim()).filter(Boolean))].sort(); }
function publicationTypeKey(value) { const text = String(value || "").toLowerCase(); if (/(期刊|journal|article)/i.test(text)) return "journal"; if (/(会议|conference|proceeding|conf)/i.test(text)) return "conference"; return "other"; }
function publicationTypeOptions(items) { const counts = { journal: 0, conference: 0, other: 0 }; items.forEach(row => counts[publicationTypeKey(row.publication_type)] += 1); const standard = [["journal", "期刊论文"], ["conference", "会议论文"], ["other", "其他论文"]].filter(([key]) => counts[key]).map(([key, label]) => ({ value: key, label: `${label} (${counts[key]})` })); const exact = uniqueOptions(items, "publication_type").map(value => ({ value: `exact:${value}`, label: value })); return [...standard, ...exact]; }
function publicationTypeMatches(row, selected) { if (selected.startsWith("exact:")) return String(row.publication_type || "") === selected.slice(6); return publicationTypeKey(row.publication_type) === selected; }
function groupPublications(items) { const labels = { journal: "期刊论文", conference: "会议论文", other: "其他论文" }; return ["journal", "conference", "other"].map(key => ({ label: labels[key], items: items.filter(row => publicationTypeKey(row.publication_type) === key) })).filter(group => group.items.length); }
function patentTypeKey(value) { const text = String(value || "").toLowerCase(); if (/(实用|utility)/i.test(text)) return "utility"; if (/(软|software|copyright|著作权)/i.test(text)) return "software"; if (/(发明|invention|patent)/i.test(text)) return "invention"; return "other"; }
function patentTypeLabel(key) { return ({ invention: "发明专利", utility: "实用新型专利", software: "软件著作权", other: "其他类型" })[key] || "其他类型"; }
function patentTypeOptions(items) { const counts = { invention: 0, utility: 0, software: 0, other: 0 }; items.forEach(row => counts[patentTypeKey(row.patent_type)] += 1); const standard = Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => ({ value: key, label: `${patentTypeLabel(key)} (${count})` })); const exact = uniqueOptions(items, "patent_type").map(value => ({ value: `exact:${value}`, label: value })); return [...standard, ...exact]; }
function patentTypeMatches(row, selected) { if (selected.startsWith("exact:")) return String(row.patent_type || "") === selected.slice(6); return patentTypeKey(row.patent_type) === selected; }
function patentAuthorizationKey(row) { return /(未授权|未登记|pending|申请|受理)/i.test(String(row.legal_status || "")) ? "pending" : "granted"; }
function normalizePatentGroup(value) { return ["type", "country", "authorization"].includes(value) ? value : "type"; }
function groupPatents(items, groupBy) { const groups = new Map(); for (const row of items) { let key = patentTypeKey(row.patent_type), label = patentTypeLabel(key); if (groupBy === "country") { key = row.country || "__blank_country__"; label = row.country || "未填国别"; } else if (groupBy === "authorization") { key = patentAuthorizationKey(row); label = key === "granted" ? "已授权" : "申请/未授权"; } if (!groups.has(key)) groups.set(key, { label, items: [] }); groups.get(key).items.push(row); } return [...groups.values()]; }
function sortStudents(items, displays, sort) { if (sort === "name") return items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))); if (sort === "newest") return items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); if (sort === "reverse") return sortStudents(items, displays, "level").reverse(); return items.sort((a, b) => studentGroupIndex(a, displays) - studentGroupIndex(b, displays) || studentYearValue(b) - studentYearValue(a) || String(b.created_at || "").localeCompare(String(a.created_at || ""))); }
function groupStudents(items, displays) { const groups = new Map(); for (const row of items) { const display = studentDisplay(row, displays); const key = display?.key || "other"; const label = display?.label || row.category || "其他"; if (!groups.has(key)) groups.set(key, { label, items: [] }); groups.get(key).items.push(row); } return [...groups.values()]; }
function studentDisplay(row, displays) { const text = [row.category, row.status, row.destination].join(" ").toLowerCase(); return displays.find(display => String(display.label || "").toLowerCase() === String(row.category || "").toLowerCase() || String(display.label_en || "").toLowerCase() === String(row.category || "").toLowerCase()) || displays.find(display => String(display.keywords || "").split(/[,，]/).some(word => word.trim() && text.includes(word.trim().toLowerCase()))) || displays.find(display => display.key === "other"); }
function studentGroupIndex(row, displays) { const display = studentDisplay(row, displays); const index = displays.findIndex(item => item.key === display?.key); return index >= 0 ? index : 999; }
function studentYearValue(row) { if (row.enrollment_date) return Number(String(row.enrollment_date).slice(0, 4)) || 0; const match = String(row.grade || "").match(/(19|20)\d{2}/); return match ? Number(match[0]) : 0; }
function studentSorts(status, active) { return [["level", "按类别"], ["newest", "最新添加"], ["name", "姓名"], ["reverse", "反向"]].map(([value, label]) => `<a class="${active === value ? "active" : ""}" href="?${status ? `status=${encodeURIComponent(status)}&` : ""}sort=${value}">${label}</a>`).join(""); }
function roleLabel(value) { return ({ first: "第一作者", corresponding: "通讯作者", other: "其他" })[value] || value; }
function sanitizeHtml(input) { return String(input || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?([a-z0-9-]+)\b([^>]*)>/gi, (full, rawTag, rawAttrs) => { const tag = rawTag.toLowerCase(); const closing = full.startsWith("</"); if (!["a","blockquote","br","code","div","em","h2","h3","h4","i","img","li","ol","p","pre","section","span","strong","u","ul"].includes(tag)) return ""; if (closing) return `</${tag}>`; if (tag === "br") return "<br>"; const attrs = []; for (const match of rawAttrs.matchAll(/([a-z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)) { const name = match[1].toLowerCase(); let value = match[2] ?? match[3] ?? match[4] ?? ""; if (!["alt","class","data-align","data-float","href","src","target","title"].includes(name)) continue; if ((name === "href" || name === "src") && !safeUrl(value)) continue; attrs.push(`${name}="${escAttr(value)}"`); } return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`; }); }
function sanitizeNewsHtml(input) { return sanitizeHtml(input).replace(/\bsrc="\/media\/([^"]+)"/g, (_match, key) => `src="/media/${escAttr(key)}"`); }
function safeUrl(value) { const text = String(value || "").trim().replace(/[\u0000-\u001f\u007f\s]+/g, ""); return /^(https?:|mailto:|\/media\/|\/assets\/|#)/i.test(text) || (!/^[a-z][a-z0-9+.-]*:/i.test(text) && !text.startsWith("//")); }
function stripHtml(input) { return String(input || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
function pdfBlocks(content) { return extractPdfLinks(content).map(pdf => `<section class="news-pdf-block"><div class="news-pdf-stage"><iframe class="news-pdf-frame" src="${escAttr(pdf.href.startsWith("/media/") ? pdf.href : `/media/${pdf.href.replace(/^\/+/, "")}`)}#toolbar=0" loading="lazy"></iframe><div class="news-pdf-watermark" data-watermark="智能诊断与可信AI团队"></div></div></section>`).join(""); }
function extractPdfLinks(html) { const links = []; for (const match of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) links.push({ href: match[1], label: stripHtml(match[2]) }); for (const match of String(html || "").matchAll(/data-news-pdf-path=["']([^"']+\.pdf)["']/gi)) links.push({ href: match[1], label: match[1].split("/").pop() || "PDF" }); return links; }
function dateOnly(value) { return String(value || "").slice(0, 10); }
function paragraphs(text) { return String(text).split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => `<p>${esc(line)}</p>`).join("") || `<p class="empty">暂无内容。</p>`; }
function initial(value) { const cleanValue = String(value || "").trim(); return cleanValue ? cleanValue.slice(0, 1).toUpperCase() : "?"; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]); }
function escAttr(value) { return esc(value).replace(/`/g, "&#96;"); }

function serveStatic(pathname, res) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const target = join(publicDir, rel);
  if (!target.startsWith(publicDir) || !existsSync(target) || !statSync(target).isFile()) { res.writeHead(404); res.end("not found"); return; }
  const type = ({ ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf" })[extname(target).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(target));
}

function html(res, body) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}
