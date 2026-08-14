import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { AppEnv } from "../types";
import { all, first, navItems, siteSettings } from "../lib/db";
import { Layout } from "../lib/html";
import { sanitizeHtml, stripHtml } from "../lib/sanitize";
import { mediaUrl } from "../lib/url";

export const publicRoutes = new Hono<AppEnv>();

async function base(c: Context<AppEnv>) {
  return { site: await siteSettings(c.env.DB), nav: await navItems(c.env.DB), path: c.req.path, lang: c.get("lang") || "zh" };
}

const publicOnly = () => "visibility = 'public'";

publicRoutes.get("/", async (c) => {
  const shell = await base(c);
  const profile = await first(c.env.DB, "SELECT * FROM profiles WHERE is_active = 1 ORDER BY sort_order, id LIMIT 1");
  const interests = await all(c.env.DB, "SELECT * FROM research_interests ORDER BY sort_order, id LIMIT 12");
  const recentPublications = await all(c.env.DB, `SELECT * FROM publications WHERE ${publicOnly()} ORDER BY year DESC, id DESC LIMIT 6`);
  const featuredPublications = await all(c.env.DB, `SELECT * FROM publications WHERE ${publicOnly()} AND is_featured = 1 ORDER BY year DESC, id DESC LIMIT 6`);
  const projects = await all(c.env.DB, `SELECT * FROM projects WHERE ${publicOnly()} AND is_featured = 1 ORDER BY sort_order, id DESC LIMIT 4`);
  const patents = await all(c.env.DB, `SELECT * FROM patents WHERE ${publicOnly()} AND is_featured = 1 ORDER BY sort_order, id DESC LIMIT 4`);
  const students = await all(c.env.DB, `SELECT * FROM students WHERE ${publicOnly()} AND is_featured = 1 ORDER BY sort_order, id DESC LIMIT 8`);
  const news = await all(c.env.DB, `SELECT * FROM news WHERE ${publicOnly()} ORDER BY created_at DESC, id DESC LIMIT 4`);
  const publications = featuredPublications.length ? featuredPublications : recentPublications;
  return c.html(
    <Layout title="" {...shell}>
      <section class="scholar-hero">
        <div class="scholar-main">
          <div class="scholar-identity">
            {avatar(profile, "scholar-avatar", c.env, String(profile?.name || shell.site?.site_name || ""))}
            <div>
              <p class="eyebrow">{String(profile?.organization || shell.site?.site_name || "")}</p>
              <h1>{String(profile?.name || shell.site?.site_name || "科研教师个人主页")}</h1>
              <p class="subtitle">{[profile?.title, profile?.lab].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div class="academic-profile">{paragraphNodes(String(profile?.bio || shell.site?.hero_subtitle || ""))}</div>
          <div class="hero-actions">
            <a class="button" href="/publications">查看论文</a>
            <a class="button secondary" href="/team">团队成员</a>
            <a class="button light" href="/contact">联系留言</a>
          </div>
        </div>
        <aside class="scholar-side">
          <h2>学术档案</h2>
          <dl>
            {profile?.email ? <><dt>邮箱</dt><dd>{String(profile.email)}</dd></> : null}
            {profile?.office ? <><dt>办公地点</dt><dd>{String(profile.office)}</dd></> : null}
            {profile?.orcid ? <><dt>ORCID</dt><dd>{String(profile.orcid)}</dd></> : null}
            {profile?.personal_homepage ? <><dt>主页</dt><dd><a href={String(profile.personal_homepage)} target="_blank" rel="noreferrer">个人主页</a></dd></> : null}
            {profile?.google_scholar ? <><dt>Scholar</dt><dd><a href={String(profile.google_scholar)} target="_blank" rel="noreferrer">Google Scholar</a></dd></> : null}
            {profile?.github ? <><dt>GitHub</dt><dd><a href={String(profile.github)} target="_blank" rel="noreferrer">GitHub</a></dd></> : null}
          </dl>
          {profile?.recruiting ? <div class="recruiting-note"><strong>招生方向</strong><p>{String(profile.recruiting)}</p></div> : null}
        </aside>
      </section>

      {interests.length ? <section class="band"><div class="section-head"><h2>研究方向</h2></div><div class="tags">{interests.map((item) => <span title={String(item.description || "")}>{String(item.name || "")}</span>)}</div></section> : null}

      <section class="home-insights">
        <div class="home-panel home-publications" id="featured-publications">
          <div class="section-head"><h2>代表论文</h2><a href="/publications">全部</a></div>
          <div class="home-feature-list">
            {publications.map((item, index) => (
              <article class="home-feature-item">
                <span class="home-feature-index">{index + 1}</span>
                <div class="home-feature-body">
                  <p>{citation(item)}</p>
                  <div class="home-feature-meta">{meta([item.year, item.venue, item.publication_type, item.index_type])}{item.doi ? <a href={`https://doi.org/${String(item.doi)}`} target="_blank" rel="noreferrer">DOI</a> : null}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div class="home-panel">
          <div class="section-head"><h2>最新动态</h2><a href="/news">全部</a></div>
          <div class="home-news-list">
            {news.map((item) => <article class="home-news-item"><time>{dateOnly(item.published_at)}</time><a href={`/news/${String(item.slug)}`}>{String(item.title || "")}</a></article>)}
          </div>
        </div>
      </section>

      <section class="grid-3">
        <div><h2>项目</h2>{lineItems(projects, "name")}</div>
        <div><h2>专利</h2>{lineItems(patents, "name")}</div>
        <div><h2>学生</h2>{lineItems(students, "name", "degree")}</div>
      </section>
    </Layout>,
  );
});

publicRoutes.get("/team", async (c) => {
  const shell = await base(c);
  const rows = await all(c.env.DB, "SELECT * FROM profiles WHERE is_active = 1 ORDER BY sort_order, id");
  return c.html(
    <Layout title="团队" {...shell} scripts={["/assets/person-summary-toggle.js"]}>
      <section class="people-list">
        {rows.map((row) => (
          <article class="person-card">
            {avatar(row, "person-avatar", c.env, String(row.name || ""))}
            <div class="person-body">
              <div class="person-head"><h2>{String(row.name || "")}</h2><span class="meta">{[row.title, row.organization].filter(Boolean).join(" · ")}</span></div>
              <p class="person-summary" id={`teacher-bio-${row.id}`}>{String(row.bio || "暂未填写个人简介。")}</p>
              <div class="person-links">
                {row.email ? <span>{String(row.email)}</span> : null}
                {row.personal_homepage ? <a href={String(row.personal_homepage)} target="_blank" rel="noreferrer">主页</a> : null}
                {row.google_scholar ? <a href={String(row.google_scholar)} target="_blank" rel="noreferrer">Scholar</a> : null}
                {row.github ? <a href={String(row.github)} target="_blank" rel="noreferrer">GitHub</a> : null}
                <button type="button" class="summary-toggle" data-summary-toggle data-expanded="false" data-more="展开简介" data-less="收起简介" aria-controls={`teacher-bio-${row.id}`} aria-expanded="false" hidden>展开简介</button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/publications", async (c) => {
  const shell = await base(c);
  const q = c.req.query("q") || "";
  const year = c.req.query("year") || "";
  const type = c.req.query("publication_type") || "";
  const role = c.req.query("author_role") || "";
  const sort = c.req.query("sort") || "";
  const where = [publicOnly()];
  const params: unknown[] = [];
  if (q) {
    where.push("(title LIKE ? OR authors LIKE ? OR venue LIKE ? OR doi LIKE ? OR keywords LIKE ? OR citation LIKE ?)");
    params.push(...Array(6).fill(`%${q}%`));
  }
  if (year) { where.push("year = ?"); params.push(Number(year)); }
  if (role) { where.push("author_role = ?"); params.push(role); }
  const order = sort === "year_asc" ? "year ASC, id ASC" : sort === "title" ? "title COLLATE NOCASE ASC" : sort === "year_desc" ? "year DESC, id DESC" : "created_at DESC, id DESC";
  let rows = await all(c.env.DB, `SELECT * FROM publications WHERE ${where.join(" AND ")} ORDER BY ${order}`, params);
  if (type) rows = rows.filter((item) => publicationTypeMatches(item, type));
  const allRows = await all(c.env.DB, `SELECT * FROM publications WHERE ${publicOnly()}`);
  const groups = groupPublications(rows);
  return c.html(
    <Layout title="论文成果" {...shell} scripts={["/assets/publications.js"]}>
      <form class="filters filters-wide publication-filters" method="get">
        <input class="filter-search" name="q" value={q} placeholder="标题、作者、期刊、关键词" />
        <input class="filter-year" name="year" value={year} placeholder="年份" />
        <select class="filter-category" name="publication_type">
          <option value="">全部论文分类</option>
          {publicationTypeOptions(allRows).map((item) => <option value={item.value} selected={item.value === type}>{item.label}</option>)}
        </select>
        <select class="filter-compact" name="author_role">
          <option value="">全部角色</option>
          {["first", "corresponding", "other"].map((value) => <option value={value} selected={value === role}>{roleLabel(value)}</option>)}
        </select>
        <select class="filter-compact" name="sort">
          <option value="" selected={!sort}>最新添加</option>
          <option value="year_desc" selected={sort === "year_desc"}>年份倒序</option>
          <option value="year_asc" selected={sort === "year_asc"}>年份正序</option>
          <option value="title" selected={sort === "title"}>题名</option>
        </select>
        <button>筛选</button>
      </form>
      <section class="copy-toolbar" aria-label="论文引用复制工具">
        <label for="citation-style">引用格式</label>
        <select id="citation-style"><option value="gbt">GB/T 7714</option><option value="apa">APA</option><option value="ieee">IEEE</option></select>
        <button type="button" id="select-all-publications" class="button light">全选</button>
        <button type="button" id="copy-selected-citations" class="button">复制所选</button>
        <span id="copy-status" class="copy-status" role="status"></span>
      </section>
      <section class="citation-list classified-list">
        {groups.map((group) => <><h2 class="group-title">{group.label} <span>{group.items.length}</span></h2>{group.items.map((item, index) => <PublicationItem item={item} index={rows.length - rows.indexOf(item)} env={c.env} />)}</>)}
        {!rows.length ? <p class="empty">暂无可见论文。</p> : null}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/featured-publications", async (c) => featuredPublicationPage(c));

publicRoutes.get("/featured-publications", async (c) => {
  const shell = await base(c);
  const rows = await all(c.env.DB, `SELECT * FROM publications WHERE ${publicOnly()} AND is_featured = 1 ORDER BY created_at DESC, id DESC`);
  return c.html(<PublicationCompactPage title="代表论文" rows={rows} shell={shell} env={c.env} />);
});

publicRoutes.get("/projects", async (c) => {
  const shell = await base(c);
  const q = c.req.query("q") || "";
  const rows = await filteredRows(c, "projects", ["name", "source", "fund_name", "summary"]);
  return c.html(
    <Layout title="科研项目" {...shell} scripts={["/assets/list-copy.js"]}>
      <form class="filters" method="get"><input name="q" value={q} placeholder="项目名称、基金、来源" /><button>搜索</button></form>
      <CopyToolbar label="项目复制工具" />
      <section class="compact-list list-copy-scope">
        {rows.map((item, index) => (
          <article class="compact-item list-copy-item" data-copy-text={projectCopyText(item)}>
            <div class="item-index"><span class="item-number">{rows.length - index}</span><input type="checkbox" class="list-copy-check" aria-label={`选择项目 ${rows.length - index}`} /></div>
            <div class="compact-body">
              <h2>{String(item.name || "")}</h2>
              <div class="compact-meta">{meta([item.status, item.source, item.fund_name, periodDisplay(item), item.project_number ? `项目号: ${String(item.project_number)}` : "", item.amount ? `金额: ${String(item.amount)} 万元` : ""])}</div>
              {item.summary ? <p class="compact-summary">{String(item.summary)}</p> : null}
              <button type="button" class="link-button list-copy-one">复制</button>
            </div>
          </article>
        ))}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/patents", async (c) => {
  const shell = await base(c);
  const q = c.req.query("q") || "";
  const selectedCountry = c.req.query("country") || "";
  const selectedType = c.req.query("patent_type") || "";
  const selectedAuth = c.req.query("authorization") || "";
  const groupBy = normalizePatentGroup(c.req.query("group_by") || "type");
  const allRows = await all(c.env.DB, `SELECT * FROM patents WHERE ${publicOnly()} ORDER BY created_at DESC, id DESC`);
  let rows = allRows.filter((item) => !q || includesAny(item, ["name", "inventors", "grant_number", "application_number", "country", "patent_type", "legal_status"], q));
  if (selectedCountry) rows = rows.filter((item) => String(item.country || "") === selectedCountry);
  if (selectedType) rows = rows.filter((item) => patentTypeMatches(item, selectedType));
  if (selectedAuth) rows = rows.filter((item) => patentAuthorizationKey(item) === selectedAuth);
  const groups = groupPatents(rows, groupBy);
  return c.html(
    <Layout title="专利成果" {...shell} scripts={["/assets/list-copy.js"]}>
      <form class="filters filters-wide patent-filters" method="get">
        <input class="filter-search" name="q" value={q} placeholder="名称、发明人、授权号" />
        <select class="filter-compact" name="country"><option value="">全部国别</option>{uniqueOptions(allRows, "country").map((value) => <option value={value} selected={value === selectedCountry}>{value}</option>)}</select>
        <select class="filter-category" name="patent_type"><option value="">全部类型</option>{patentTypeOptions(allRows).map((item) => <option value={item.value} selected={item.value === selectedType}>{item.label}</option>)}</select>
        <select class="filter-compact" name="authorization"><option value="">全部授权状态</option><option value="granted" selected={selectedAuth === "granted"}>已授权</option><option value="pending" selected={selectedAuth === "pending"}>申请/未授权</option></select>
        <select class="filter-compact" name="group_by"><option value="type" selected={groupBy === "type"}>按类型分组</option><option value="country" selected={groupBy === "country"}>按国别分组</option><option value="authorization" selected={groupBy === "authorization"}>按授权状态分组</option></select>
        <button>搜索</button>
      </form>
      <CopyToolbar label="专利复制工具" />
      <section class="compact-list classified-list list-copy-scope">
        {groups.map((group) => <><h2 class="group-title">{group.label} <span>{group.items.length}</span></h2>{group.items.map((item, index) => <PatentItem item={item} index={rows.length - rows.indexOf(item)} />)}</>)}
        {!rows.length ? <p class="empty">暂无可见专利。</p> : null}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/students", async (c) => {
  const shell = await base(c);
  const status = c.req.query("status") || "";
  const sort = c.req.query("sort") || "level";
  const displays = await all(c.env.DB, "SELECT * FROM student_category_displays WHERE enabled = 1 ORDER BY display_order, id");
  let rows = await filteredRows(c, "students", ["status"], status);
  rows = sortStudents(rows, displays, sort);
  const groups = groupStudents(rows, displays);
  return c.html(
    <Layout title="学生团队" {...shell} scripts={["/assets/list-copy.js"]}>
      <form class="filters" method="get"><input name="status" value={status} placeholder="在读、毕业、访问" /><input type="hidden" name="sort" value={sort} /><button>筛选</button></form>
      <nav class="segmented sort-tabs" aria-label="学生排序">{studentSorts(status, sort)}</nav>
      <CopyToolbar label="学生信息复制工具" />
      <section class="people-list list-copy-scope">
        {groups.map((group) => <><h2 class="group-title">{group.label}</h2>{group.items.map((item) => <StudentItem item={item} env={c.env} />)}</>)}
        {!rows.length ? <p class="empty">暂无可见学生信息。</p> : null}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/courses", async (c) => {
  const shell = await base(c);
  const rows = await all(c.env.DB, `SELECT * FROM courses WHERE ${publicOnly()} ORDER BY created_at DESC, id DESC`);
  return c.html(
    <Layout title="教学工作" {...shell}>
      <section class="cards">
        {rows.map((item, index) => (
          <article class="card">
            <div class="item-number">{index + 1}</div>
            <div class="meta">{[item.semester || "学期未填", item.audience].filter(Boolean).join(" · ")}</div>
            <h2>{String(item.name || "")}</h2>
            {item.summary ? <p>{String(item.summary)}</p> : null}
            <div class="links">{item.syllabus_key ? <a href={mediaUrl(item.syllabus_key, c.env)}>教学大纲</a> : null}{item.material_key ? <a href={mediaUrl(item.material_key, c.env)}>课件资料</a> : null}</div>
          </article>
        ))}
        {!rows.length ? <p class="empty">暂无课程信息。</p> : null}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/news", async (c) => {
  const shell = await base(c);
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const pageSize = 10;
  const rows = await all(c.env.DB, `SELECT * FROM news WHERE ${publicOnly()} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [pageSize + 1, (page - 1) * pageSize]);
  const visible = rows.slice(0, pageSize);
  return c.html(
    <Layout title="新闻动态" {...shell}>
      <section class="news-list">
        {visible.map((item, index) => (
          <article class="news-row" id={`news-${item.id}`}>
            <div class="item-number">{(page - 1) * pageSize + index + 1}</div>
            <a class={`news-cover ${item.cover_key ? "" : "placeholder"}`} href={`/news/${String(item.slug)}`}>
              {item.cover_key ? <img src={mediaUrl(item.cover_key, c.env)} alt={String(item.title || "")} loading="lazy" /> : <span>{String(item.title || "").slice(0, 1)}</span>}
            </a>
            <div class="news-content">
              <div class="news-meta-line"><time>{dateOnly(item.published_at)}</time>{item.category ? <span>{String(item.category)}</span> : null}</div>
              <h2><a href={`/news/${String(item.slug)}`}>{String(item.title || "")}</a></h2>
              <p class="news-excerpt">{stripHtml(item.content).slice(0, 120)}</p>
            </div>
          </article>
        ))}
      </section>
      <nav class="pagination">{page > 1 ? <a href={`?page=${page - 1}`}>上一页</a> : null}<span>第 {page} 页</span>{rows.length > pageSize ? <a href={`?page=${page + 1}`}>下一页</a> : null}</nav>
    </Layout>,
  );
});

publicRoutes.get("/news/:slug", async (c) => {
  const shell = await base(c);
  const row = await first(c.env.DB, `SELECT * FROM news WHERE slug = ? AND ${publicOnly()} LIMIT 1`, [c.req.param("slug")]);
  if (!row) return c.notFound();
  const comments = await all(c.env.DB, "SELECT * FROM news_comments WHERE news_id = ? AND is_approved = 1 ORDER BY created_at", [row.id]);
  return c.html(
    <Layout title={String(row.title)} {...shell}>
      <article class="article news-detail-article">
        <a class="back-link" href="/news">返回新闻列表</a>
        <h1>{String(row.title)}</h1>
        <p class="meta">{[row.category, dateOnly(row.published_at)].filter(Boolean).join(" · ")}</p>
        {row.cover_key ? <img class="cover" src={mediaUrl(row.cover_key, c.env)} alt="" /> : null}
        <div class="content rich-content">{renderNewsBlocks(row, c.env)}</div>
      </article>
      <div class="comment-section-divider"><span></span></div>
      <section id="comments" class="comments">
        <h2>评论</h2>
        {comments.map((item) => <div class={`comment ${item.parent_id ? "reply" : ""}`}><strong>{String(item.name)}</strong><time>{dateOnly(item.created_at)}</time><p>{String(item.content)}</p></div>)}
        {Number(row.allow_comments || 0) ? <details class="comment-composer"><summary><span class="comment-composer-icon">+</span><span><strong>提交评论</strong><small>展开后填写姓名、邮箱和评论内容</small></span></summary><form class="form-card comment-form-card" method="post" action={`/api/news/${row.slug}/comments`}><p><label>姓名</label><input name="name" required /></p><p><label>邮箱</label><input name="email" type="email" /></p><p><label>内容</label><textarea name="content" required></textarea></p><button>提交评论</button></form></details> : null}
      </section>
    </Layout>,
  );
});

publicRoutes.get("/contact", async (c) => {
  const shell = await base(c);
  return c.html(
    <Layout title="联系留言" {...shell}>
      <section class="page-head"><h1>联系留言</h1><p>注册用户可留言；是否允许匿名留言由后台设置。</p></section>
      <form class="form-card" method="post" action="/api/messages" enctype="multipart/form-data">
        <input name="website" tabIndex={-1} autocomplete="off" class="hidden-field" />
        <p><label>姓名</label><input name="name" required /></p>
        <p><label>邮箱</label><input name="email" type="email" required /></p>
        <p><label>留言类型</label><select name="message_type"><option value="recruiting">招生咨询</option><option value="cooperation">合作交流</option><option value="paper">论文咨询</option><option value="project">项目咨询</option><option value="course">课程咨询</option><option value="other">其他</option></select></p>
        <p><label>主题</label><input name="subject" required /></p>
        <p><label>内容</label><textarea name="content" required></textarea></p>
        <p><label>附件</label><span class="file-control"><input id="attachment" name="attachment" type="file" /><button class="button light file-control-button" type="button" id="attachment-picker-button">选择附件</button><span class="file-control-name" data-empty="未选择文件">未选择文件</span></span></p>
        <button class="button">提交留言</button>
      </form>
    </Layout>,
  );
});

async function filteredRows(c: Context<AppEnv>, table: string, fields: string[], qOverride?: string) {
  const q = qOverride ?? c.req.query("q") ?? "";
  const where = [publicOnly()];
  const params: unknown[] = [];
  if (q) {
    where.push(`(${fields.map((field) => `${field} LIKE ?`).join(" OR ")})`);
    params.push(...fields.map(() => `%${q}%`));
  }
  return all(c.env.DB, `SELECT * FROM ${table} WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC`, params);
}

function PublicationCompactPage(props: { title: string; rows: Record<string, unknown>[]; shell: Awaited<ReturnType<typeof base>>; env: AppEnv["Bindings"] }) {
  return <Layout title={props.title} {...props.shell} scripts={["/assets/publications.js"]}><section class="copy-toolbar"><label for="citation-style">引用格式</label><select id="citation-style"><option value="gbt">GB/T 7714</option><option value="apa">APA</option><option value="ieee">IEEE</option></select><button type="button" id="select-all-publications" class="button light">全选</button><button type="button" id="copy-selected-citations" class="button">复制所选</button><span id="copy-status" class="copy-status"></span></section><section class="citation-list">{props.rows.map((item, index) => <PublicationItem item={item} index={props.rows.length - index} env={props.env} />)}</section></Layout>;
}

async function featuredPublicationPage(c: Context<AppEnv>) {
  const shell = await base(c);
  const lang = shell.lang;
  const q = c.req.query("q") || "";
  const year = c.req.query("year") || "";
  const type = c.req.query("publication_type") || "";
  const role = c.req.query("author_role") || "";
  const sort = c.req.query("sort") || "";
  const where = [publicOnly(), "is_featured = 1"];
  const params: unknown[] = [];
  if (q) {
    where.push("(title LIKE ? OR title_en LIKE ? OR authors LIKE ? OR venue LIKE ? OR doi LIKE ? OR keywords LIKE ? OR citation LIKE ?)");
    params.push(...Array(7).fill(`%${q}%`));
  }
  if (year) { where.push("year = ?"); params.push(Number(year)); }
  if (role) { where.push("author_role = ?"); params.push(role); }
  const order = sort === "year_asc" ? "year ASC, id ASC" : sort === "title" ? "title COLLATE NOCASE ASC" : sort === "year_desc" ? "year DESC, id DESC" : "created_at DESC, id DESC";
  let rows = await all(c.env.DB, `SELECT * FROM publications WHERE ${where.join(" AND ")} ORDER BY ${order}`, params);
  if (type) rows = rows.filter((item) => publicationTypeMatches(item, type));
  const allRows = await all(c.env.DB, `SELECT * FROM publications WHERE ${publicOnly()} AND is_featured = 1`);
  const groups = groupPublications(rows, lang);
  return c.html(
    <Layout title={txt(lang, "代表论文", "Featured Publications")} {...shell} scripts={["/assets/publications.js"]}>
      <form class="filters filters-wide publication-filters" method="get">
        {lang === "en" ? <input type="hidden" name="lang" value="en" /> : null}
        <input class="filter-search" name="q" value={q} placeholder={txt(lang, "标题、作者、期刊、关键词", "Title, author, venue, keywords")} />
        <input class="filter-year" name="year" value={year} placeholder={txt(lang, "年份", "Year")} />
        <select class="filter-category" name="publication_type">
          <option value="">{txt(lang, "全部论文分类", "All publication types")}</option>
          {publicationTypeOptions(allRows).map((item) => <option value={item.value} selected={item.value === type}>{item.label}</option>)}
        </select>
        <select class="filter-compact" name="author_role">
          <option value="">{txt(lang, "全部角色", "All roles")}</option>
          {["first", "corresponding", "other"].map((value) => <option value={value} selected={value === role}>{roleLabel(value)}</option>)}
        </select>
        <select class="filter-compact" name="sort">
          <option value="" selected={!sort}>{txt(lang, "最新添加", "Newest")}</option>
          <option value="year_desc" selected={sort === "year_desc"}>{txt(lang, "年份倒序", "Year desc")}</option>
          <option value="year_asc" selected={sort === "year_asc"}>{txt(lang, "年份正序", "Year asc")}</option>
          <option value="title" selected={sort === "title"}>{txt(lang, "题名", "Title")}</option>
        </select>
        <button>{txt(lang, "搜索", "Search")}</button>
      </form>
      <section class="copy-toolbar" aria-label={txt(lang, "论文引用复制工具", "Publication citation tools")}>
        <label for="citation-style">{txt(lang, "引用格式", "Citation style")}</label>
        <select id="citation-style"><option value="gbt">GB/T 7714</option><option value="apa">APA</option><option value="ieee">IEEE</option></select>
        <button type="button" id="select-all-publications" class="button light">{txt(lang, "全选", "Select all")}</button>
        <button type="button" id="copy-selected-citations" class="button">{txt(lang, "复制所选", "Copy selected")}</button>
        <span id="copy-status" class="copy-status" role="status"></span>
      </section>
      <section class="citation-list classified-list">
        {groups.map((group) => <><h2 class="group-title">{group.label} <span>{group.items.length}</span></h2>{group.items.map((item) => <PublicationItem item={item} index={rows.length - rows.indexOf(item)} env={c.env} />)}</>)}
        {!rows.length ? <p class="empty">{txt(lang, "暂无可见论文。", "No visible publications.")}</p> : null}
      </section>
    </Layout>,
  );
}

function PublicationItem(props: { item: Record<string, unknown>; index: number; env: AppEnv["Bindings"] }) {
  const text = citation(props.item);
  return <article class="citation-item" data-citation-gbt={text} data-citation-apa={text} data-citation-ieee={text} data-citation-gbt-html={text} data-citation-apa-html={text} data-citation-ieee-html={text}><div class="citation-index"><span>{props.index}</span><input type="checkbox" class="publication-check" aria-label={`选择论文 ${props.index}`} /></div><div class="citation-body"><span class="citation-text">{text}</span><div class="citation-tools">{meta([props.item.year, props.item.publication_type, props.item.index_type, props.item.venue])}<button type="button" class="link-button copy-one-citation">复制</button>{props.item.doi ? <a href={`https://doi.org/${String(props.item.doi)}`} target="_blank" rel="noreferrer">DOI</a> : null}{props.item.url ? <a href={String(props.item.url)} target="_blank" rel="noreferrer">原文链接</a> : null}{props.item.pdf_key ? <a href={mediaUrl(props.item.pdf_key, props.env)}>下载 PDF</a> : null}</div></div></article>;
}

function PatentItem(props: { item: Record<string, unknown>; index: number }) {
  const item = props.item;
  return <article class="compact-item list-copy-item" data-copy-text={patentCopyText(item)}><div class="item-index"><span class="item-number">{props.index}</span><input type="checkbox" class="list-copy-check" aria-label={`选择专利 ${props.index}`} /></div><div class="compact-body"><h2>{String(item.name || "")}</h2><div class="compact-meta">{meta([item.country, item.patent_type, item.legal_status, item.application_number ? `申请号: ${String(item.application_number)}` : "", item.application_date ? `申请日期: ${String(item.application_date)}` : "", item.grant_number ? `授权号: ${String(item.grant_number)}` : "", item.grant_date ? `授权日期: ${String(item.grant_date)}` : ""])}</div>{item.inventors ? <p class="compact-summary">发明人: {String(item.inventors)}</p> : null}{item.summary ? <p class="compact-summary">{String(item.summary)}</p> : null}<button type="button" class="link-button list-copy-one">复制</button></div></article>;
}

function StudentItem(props: { item: Record<string, unknown>; env: AppEnv["Bindings"] }) {
  const item = props.item;
  return <article class="person-card student-card list-copy-item" data-copy-text={[item.name, item.degree, item.grade, item.direction, item.status, item.destination].filter(Boolean).join("; ")}><div class="person-select"><input type="checkbox" class="list-copy-check" aria-label={`选择 ${String(item.name || "")}`} /></div>{avatar(item, "person-avatar", props.env, String(item.name || ""))}<div class="person-body"><div class="person-head"><h2>{String(item.name || "")}</h2><span class="meta">{[item.status || "状态未填", item.degree, item.grade].filter(Boolean).join(" · ")}</span></div>{item.direction ? <p class="person-summary">{String(item.direction)}</p> : null}<div class="person-links">{item.destination ? <span>去向: {String(item.destination)}</span> : null}{item.email ? <span>{String(item.email)}</span> : null}<button type="button" class="link-button list-copy-one">复制</button></div></div></article>;
}

function CopyToolbar(props: { label: string }) {
  return <section class="copy-toolbar" aria-label={props.label}><button type="button" class="button light list-select-all">全选</button><button type="button" class="button list-copy-selected">复制所选</button><span class="copy-status" role="status"></span></section>;
}

function avatar(row: Record<string, unknown> | null, className: string, env: AppEnv["Bindings"], label: string) {
  if (row?.avatar_key) return <img class={className} src={mediaUrl(row.avatar_key, env)} alt={label} loading="lazy" />;
  return <div class={`${className} placeholder`}>{initial(label)}</div>;
}

function lineItems(rows: Record<string, unknown>[], field: string, extra = "") {
  if (!rows.length) return <p class="empty">暂无内容。</p>;
  return rows.map((item) => <p class="line">{String(item[field] || "")}{extra && item[extra] ? ` · ${String(item[extra])}` : ""}</p>);
}

function meta(values: unknown[]) {
  return values.filter(Boolean).map((value) => <span>{String(value)}</span>);
}

function citation(row: Record<string, unknown>) {
  return String(row.citation || [row.authors, row.title, row.venue, row.year].filter(Boolean).join(". "));
}

function projectCopyText(row: Record<string, unknown>) {
  return [row.name, row.status ? `状态: ${row.status}` : "", row.source ? `来源: ${row.source}` : "", row.fund_name ? `基金: ${row.fund_name}` : "", `周期: ${periodDisplay(row)}`, row.project_number ? `项目号: ${row.project_number}` : "", row.summary ? `简介: ${row.summary}` : ""].filter(Boolean).join("; ");
}

function patentCopyText(row: Record<string, unknown>) {
  return [row.name, row.country ? `国家: ${row.country}` : "", row.patent_type ? `类型: ${row.patent_type}` : "", row.inventors ? `发明人: ${row.inventors}` : "", row.application_number ? `申请号: ${row.application_number}` : "", row.grant_number ? `授权号: ${row.grant_number}` : "", row.legal_status ? `状态: ${row.legal_status}` : ""].filter(Boolean).join("; ");
}

function periodDisplay(row: Record<string, unknown>) {
  if (row.start_date && row.end_date) return `${String(row.start_date).slice(0, 10)} 至 ${String(row.end_date).slice(0, 10)}`;
  if (row.start_date) return `${String(row.start_date).slice(0, 10)} 起`;
  if (row.end_date) return `截至 ${String(row.end_date).slice(0, 10)}`;
  return "时间未填";
}

function includesAny(row: Record<string, unknown>, fields: string[], q: string) {
  return fields.map((field) => row[field]).join(" ").toLowerCase().includes(q.toLowerCase());
}

function uniqueOptions(rows: Record<string, unknown>[], field: string) {
  return [...new Set(rows.map((row) => String(row[field] || "").trim()).filter(Boolean))].sort();
}

function publicationTypeKey(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (/(期刊|journal|article)/i.test(text)) return "journal";
  if (/(会议|conference|proceeding|conf)/i.test(text)) return "conference";
  return "other";
}

function publicationTypeOptions(rows: Record<string, unknown>[]) {
  const counts = { journal: 0, conference: 0, other: 0 };
  rows.forEach((row) => { counts[publicationTypeKey(row.publication_type)] += 1; });
  const standard = [
    { value: "journal", label: `期刊论文 (${counts.journal})` },
    { value: "conference", label: `会议论文 (${counts.conference})` },
    { value: "other", label: `其他论文 (${counts.other})` },
  ].filter((item) => !item.label.includes("(0)"));
  const exact = uniqueOptions(rows, "publication_type").map((value) => ({ value: `exact:${value}`, label: value }));
  return [...standard, ...exact];
}

function publicationTypeMatches(row: Record<string, unknown>, selected: string) {
  if (selected.startsWith("exact:")) return String(row.publication_type || "") === selected.slice(6);
  return publicationTypeKey(row.publication_type) === selected;
}

function groupPublications(rows: Record<string, unknown>[], lang: "zh" | "en" = "zh") {
  const labels = lang === "en"
    ? { journal: "Journal Articles", conference: "Conference Papers", other: "Other Publications" }
    : { journal: "期刊论文", conference: "会议论文", other: "其他论文" };
  return (["journal", "conference", "other"] as const).map((key) => ({ key, label: labels[key], items: rows.filter((row) => publicationTypeKey(row.publication_type) === key) })).filter((group) => group.items.length);
}

function txt(lang: "zh" | "en", zh: string, en: string) {
  return lang === "en" ? en : zh;
}

function patentTypeKey(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (/(实用|utility)/i.test(text)) return "utility";
  if (/(软|software|copyright|著作权)/i.test(text)) return "software";
  if (/(发明|invention|patent)/i.test(text)) return "invention";
  return "other";
}

function patentTypeLabel(key: string) {
  return ({ invention: "发明专利", utility: "实用新型专利", software: "软件著作权", other: "其他类型" } as Record<string, string>)[key] || "其他类型";
}

function patentTypeOptions(rows: Record<string, unknown>[]) {
  const counts = { invention: 0, utility: 0, software: 0, other: 0 };
  rows.forEach((row) => { counts[patentTypeKey(row.patent_type) as keyof typeof counts] += 1; });
  const standard = Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => ({ value: key, label: `${patentTypeLabel(key)} (${count})` }));
  const exact = uniqueOptions(rows, "patent_type").map((value) => ({ value: `exact:${value}`, label: value }));
  return [...standard, ...exact];
}

function patentTypeMatches(row: Record<string, unknown>, selected: string) {
  if (selected.startsWith("exact:")) return String(row.patent_type || "") === selected.slice(6);
  return patentTypeKey(row.patent_type) === selected;
}

function patentAuthorizationKey(row: Record<string, unknown>) {
  const text = String(row.legal_status || "").toLowerCase();
  return /(未授权|未登记|pending|申请|受理)/i.test(text) ? "pending" : "granted";
}

function normalizePatentGroup(value: string) {
  return ["type", "country", "authorization"].includes(value) ? value : "type";
}

function groupPatents(rows: Record<string, unknown>[], groupBy: string) {
  const groups = new Map<string, { label: string; items: Record<string, unknown>[] }>();
  for (const row of rows) {
    let key = patentTypeKey(row.patent_type);
    let label = patentTypeLabel(key);
    if (groupBy === "country") {
      key = String(row.country || "__blank_country__");
      label = String(row.country || "未填国别");
    } else if (groupBy === "authorization") {
      key = patentAuthorizationKey(row);
      label = key === "granted" ? "已授权" : "申请/未授权";
    }
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)?.items.push(row);
  }
  return [...groups.values()];
}

function sortStudents(rows: Record<string, unknown>[], displays: Record<string, unknown>[], sort: string): Record<string, unknown>[] {
  if (sort === "name") return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  if (sort === "newest") return rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  if (sort === "reverse") return sortStudents(rows, displays, "level").reverse();
  return rows.sort((a, b) => studentGroupIndex(a, displays) - studentGroupIndex(b, displays) || studentYearValue(b) - studentYearValue(a) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function groupStudents(rows: Record<string, unknown>[], displays: Record<string, unknown>[]) {
  const groups = new Map<string, { label: string; items: Record<string, unknown>[] }>();
  for (const row of rows) {
    const display = studentDisplay(row, displays);
    const key = String(display?.key || "other");
    const label = String(display?.label || row.category || "其他");
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)?.items.push(row);
  }
  return [...groups.values()];
}

function studentDisplay(row: Record<string, unknown>, displays: Record<string, unknown>[]) {
  const text = [row.category, row.status, row.destination].join(" ").toLowerCase();
  return displays.find((display) => String(display.label || "").toLowerCase() === String(row.category || "").toLowerCase() || String(display.label_en || "").toLowerCase() === String(row.category || "").toLowerCase()) || displays.find((display) => String(display.keywords || "").split(/[,，]/).some((word) => word.trim() && text.includes(word.trim().toLowerCase()))) || displays.find((display) => display.key === "other");
}

function studentGroupIndex(row: Record<string, unknown>, displays: Record<string, unknown>[]) {
  const display = studentDisplay(row, displays);
  const index = displays.findIndex((item) => item.key === display?.key);
  return index >= 0 ? index : 999;
}

function studentYearValue(row: Record<string, unknown>) {
  if (row.enrollment_date) return Number(String(row.enrollment_date).slice(0, 4)) || 0;
  const match = String(row.grade || "").match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

function studentSorts(status: string, active: string) {
  const options = [["level", "按类别"], ["newest", "最新添加"], ["name", "姓名"], ["reverse", "反向"]];
  return options.map(([value, label]) => <a class={active === value ? "active" : ""} href={`?${status ? `status=${encodeURIComponent(status)}&` : ""}sort=${value}`}>{label}</a>);
}

function roleLabel(value: string) {
  return ({ first: "第一作者", corresponding: "通讯作者", other: "其他" } as Record<string, string>)[value] || value;
}

function renderNewsBlocks(row: Record<string, unknown>, env: AppEnv["Bindings"]) {
  const raw = String(row.content || "");
  const safe = sanitizeNewsHtml(raw, env);
  const blocks: Child[] = [<div dangerouslySetInnerHTML={{ __html: safe }} />];
  for (const pdf of extractPdfLinks(raw)) {
    const url = pdf.href.startsWith("/media/") ? pdf.href : mediaUrl(pdf.href.replace(/^\/+/, ""), env);
    blocks.push(<section class="news-pdf-block"><div class="news-pdf-stage"><iframe class="news-pdf-frame" src={`${url}#toolbar=0`} loading="lazy"></iframe><div class="news-pdf-watermark" data-watermark="智能诊断与可信AI团队"></div></div></section>);
  }
  return blocks;
}

function sanitizeNewsHtml(html: string, env: AppEnv["Bindings"]) {
  return sanitizeHtml(html).replace(/\bsrc="\/media\/([^"]+)"/g, (_match, key) => `src="${mediaUrl(key, env)}"`);
}

function extractPdfLinks(html: string) {
  const links: { href: string; label: string }[] = [];
  const linkRe = /<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkRe)) links.push({ href: match[1], label: stripHtml(match[2]) });
  const dataRe = /data-news-pdf-path=["']([^"']+\.pdf)["']/gi;
  for (const match of html.matchAll(dataRe)) links.push({ href: match[1], label: match[1].split("/").pop() || "PDF" });
  return links;
}

function paragraphNodes(text: string) {
  const lines = String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines.map((line) => <p>{line}</p>) : [<p class="empty">暂无内容。</p>];
}

function initial(value: string) {
  const clean = value.trim();
  return clean ? clean.slice(0, 1).toUpperCase() : "?";
}

function dateOnly(value: unknown) {
  return String(value || "").slice(0, 10);
}
