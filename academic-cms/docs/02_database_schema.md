# 教师网站数据库字段字典

本字典描述当前 SQLite / D1 数据结构，共 **27 张表、394 个字段**。仅记录现有数据表及使用含义。文件快传使用另一套独立数据库，见 [14_file_transfer_database.md](14_file_transfer_database.md)。

## 阅读说明

“可空”以实际数据库声明为准，和“表单可选”不同：非空字段可能有默认值，表单也可能对可空数据库字段作更严格输入校验。默认值“未声明”表示 SQL 没有 DEFAULT，并不表示业务插入时没有赋值。整数主键由数据库或对应业务生成，不能统一理解为手工填写。

`id`、`uid`、`created_at`、`updated_at` 只出现在实际定义了它们的表中。多数业务表的时间使用 UTC ISO 文本；限流等系统表也使用整数时间，具体类型按各表记录。布尔字段在 SQLite 中用 0/1 保存；JSON 字段以 TEXT 存储，由校验约束其结构。

业务记录通常通过 UID 关联，媒体通常通过 object_key 关联。表中的外键和唯一键按当前数据库列出；没有声明数据库外键的关系，仍可能由业务服务检查。可见性枚举为 public / authenticated / staff / owner / hidden，公共列表实际查询公开内容。

人工英文内容、翻译缓存、原始引用、结构化论文元数据和多种引用输出分别保存，不应互相覆盖。后台可编辑范围与数据库完整字段范围不同。

机器可读结构见 [data/teacher-schema.json](data/teacher-schema.json)，包含完整建表 SQL（含 CHECK）、字段、外键和索引；[data/admin-form-fields.json](data/admin-form-fields.json) 列出当前内容与配置表单的字段定义。结构文件不含任何业务记录或密钥值。

## 数据表索引

| 数据表 | 用途 | 字段数 | 管理类型 |
| --- | --- | --- | --- |
| `site_settings` | 网站设置 | 19 | 后台业务或配置数据 |
| `global_settings` | 全局设置 | 41 | 后台业务或配置数据 |
| `navigation_items` | 导航与按钮 | 16 | 后台业务或配置数据 |
| `profiles` | 教师与团队 | 36 | 后台业务或配置数据 |
| `research_interests` | 研究方向 | 9 | 后台业务或配置数据 |
| `publications` | 论文 | 35 | 后台业务或配置数据 |
| `projects` | 科研项目 | 19 | 后台业务或配置数据 |
| `patents` | 专利与软件著作 | 19 | 后台业务或配置数据 |
| `students` | 学生 | 24 | 后台业务或配置数据 |
| `student_category_displays` | 学生分类显示 | 10 | 后台业务或配置数据 |
| `news` | 新闻动态 | 18 | 后台业务或配置数据 |
| `courses` | 课程 | 15 | 后台业务或配置数据 |
| `messages` | 留言 | 12 | 后台业务或配置数据 |
| `media_assets` | 媒体资源 | 12 | 后台业务或配置数据 |
| `translation_cache` | 翻译缓存 | 16 | 后台业务或配置数据 |
| `auth_users` | 用户 | 13 | 后台业务或配置数据 |
| `auth_roles` | 角色 | 11 | 后台业务或配置数据 |
| `auth_permissions` | 模块权限 | 12 | 后台业务或配置数据 |
| `auth_sessions` | 登录会话 | 12 | 系统维护数据 |
| `auth_login_throttles` | 登录限流 | 7 | 系统维护数据 |
| `public_action_throttles` | 公共动作限流 | 8 | 系统维护数据 |
| `operation_logs` | 操作日志 | 12 | 系统维护数据 |
| `cache_generations` | 缓存版本 | 3 | 系统维护数据 |
| `admin_mutation_guards` | 并发修改保护 | 5 | 系统维护数据 |
| `auth_bootstrap_state` | 首次管理员初始化状态 | 3 | 系统维护数据 |
| `demo_seed_state` | 演示数据状态 | 4 | 系统维护数据 |
| `_cms_migrations` | 数据库结构状态 | 3 | 系统维护数据 |

## site_settings — 网站设置

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `is_active` | 当前启用 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `site_name` | 中文站点名称 | `TEXT` | 否 | 未声明 | 必填；表单 text；最多字符 200 |
| `site_name_en` | 英文站点名称 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 200 |
| `hero_title` | 首页主标题 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 300 |
| `hero_subtitle` | 首页副标题 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea；最多字符 2000 |
| `logo_key` | Logo | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media；最多字符 512 |
| `favicon_key` | 浏览器图标 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media；最多字符 512 |
| `og_image_key` | 社交分享图 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media；最多字符 512 |
| `seo_title` | SEO 标题 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 300 |
| `seo_description` | SEO 描述 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea；最多字符 1000 |
| `seo_keywords` | SEO 关键词 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 1000 |
| `footer_text` | 页脚内容（支持 HTML） | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea；最多字符 10000；支持安全 HTML；统一控制前台页脚。 |
| `homepage_profile_uid` | 旧版首页成员（兼容保留） | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 128；兼容保存字段；当前首页主教师按公开、启用、精选及排序选择。 |
| `homepage_publication_limit` | 首页论文数量 | `INTEGER` | 否 | `6` | 可选/按默认值；表单 integer；最小 0；最大 100 |
| `homepage_news_limit` | 首页动态数量 | `INTEGER` | 否 | `5` | 可选/按默认值；表单 integer；最小 0；最大 100 |

外键：

- `homepage_profile_uid` → `profiles.uid`；更新 RESTRICT，删除 SET NULL。
- `og_image_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。
- `favicon_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。
- `logo_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 唯一 `ux_site_settings_single_active`：`is_active`（条件索引，条件见结构 JSON）。
- 唯一 `idx_site_settings_one_active`：`is_active`（条件索引，条件见结构 JSON）。
- 普通 `idx_site_settings_homepage_profile_uid`：`homepage_profile_uid`。
- 普通 `idx_site_settings_og_image_key`：`og_image_key`。
- 普通 `idx_site_settings_favicon_key`：`favicon_key`。
- 普通 `idx_site_settings_logo_key`：`logo_key`。
- 唯一 `sqlite_autoindex_site_settings_1`：`uid`。

## global_settings — 全局设置

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `allow_public_registration` | 允许公开注册 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `allow_anonymous_messages` | 允许匿名留言 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `upload_max_size_mb` | 上传上限（MB） | `INTEGER` | 否 | `20` | 可选/按默认值；表单 integer；最小 1；最大 20 |
| `upload_allowed_extensions` | 允许上传扩展名 | `TEXT` | 否 | `'["jpg","jpeg","png","webp","pdf"]'` | 可选/按默认值；表单 textarea；最多字符 2000 |
| `media_trash_retention_days` | 回收站保留天数 | `INTEGER` | 否 | `30` | 可选/按默认值；表单 integer；最小 1；最大 3650 |
| `news_pdf_engine` | PDF 展示引擎 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 select；候选 browser, pdfjs；兼容配置；当前新闻内嵌 PDF 固定使用 PDF.js，不读取此项。 |
| `news_pdf_allow_download` | 允许 PDF 下载 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1；兼容配置；不控制当前新闻内嵌 PDF 的下载行为。 |
| `news_pdf_watermark` | PDF 水印说明 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 500；兼容配置；当前新闻内嵌 PDF 不绘制此水印。 |
| `translation_provider` | 默认翻译服务 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 select；候选 libretranslate, deepl, google, microsoft, mymemory |
| `translation_providers` | 可用翻译服务 JSON | `TEXT` | 否 | `'[]'` | 可选/按默认值；表单 textarea；最多字符 10000 |
| `libretranslate_url` | LibreTranslate 地址 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url；最多字符 2000 |
| `libretranslate_api_key` | LibreTranslate API Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096 |
| `deepl_api_key` | DeepL API Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096 |
| `google_translate_api_key` | Google Translate API Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096 |
| `microsoft_translator_key` | Microsoft Translator Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096 |
| `microsoft_translator_region` | Microsoft 区域 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 200 |
| `microsoft_translator_endpoint` | Microsoft Endpoint | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url；最多字符 2000 |
| `mymemory_email` | MyMemory 邮箱 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 email；最多字符 320 |
| `translation_batch_size` | 每批翻译条数 | `INTEGER` | 否 | `10` | 可选/按默认值；表单 integer；最小 1；最大 50 |
| `translation_worker_count` | 翻译并发数 | `INTEGER` | 否 | `2` | 可选/按默认值；表单 integer；最小 1；最大 8 |
| `translation_timeout_seconds` | 翻译超时（秒） | `INTEGER` | 否 | `15` | 可选/按默认值；表单 integer；最小 1；最大 120 |
| `translation_job_state` | 翻译任务状态 JSON | `TEXT` | 否 | `'{}'` | 可选/按默认值；表单 textarea；最多字符 200000 |
| `publication_metadata_provider` | 论文元数据服务 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 select；候选 crossref, openalex, semantic-scholar, datacite, europe-pmc, pubmed |
| `publication_metadata_providers` | 论文元数据服务 JSON | `TEXT` | 否 | `'[]'` | 可选/按默认值；表单 textarea；最多字符 10000 |
| `publication_display_style` | 论文引用样式 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 select；候选 gbt, elsevier, apa, ieee |
| `publication_suggestion_cache_seconds` | 论文建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `profile_suggestion_cache_seconds` | 人员建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `project_suggestion_cache_seconds` | 项目建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `patent_suggestion_cache_seconds` | 专利建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `student_suggestion_cache_seconds` | 学生建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `news_suggestion_cache_seconds` | 动态建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `course_suggestion_cache_seconds` | 课程建议缓存秒数 | `INTEGER` | 否 | `60` | 可选/按默认值；表单 integer；最小 0；最大 86400；保留的建议缓存配置；当前历史值建议查询不使用此项控制缓存时长。 |
| `patent_metadata_providers` | 专利元数据服务 JSON | `TEXT` | 否 | `'[]'` | 可选/按默认值；表单 textarea；最多字符 10000；保存服务配置；当前实际专利查询调用 PatentsView。 |
| `patentsview_api_key` | PatentsView API Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096 |
| `epo_ops_client_id` | EPO OPS Client ID | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096；保存凭据字段；当前专利查询没有 EPO OPS 通道。 |
| `epo_ops_client_secret` | EPO OPS Client Secret | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 secret；最多字符 4096；敏感凭据；当前专利查询没有 EPO OPS 通道。 |
| `notify_email` | 系统通知邮箱 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 email；最多字符 320；通知联系配置，也供适用元数据请求使用；不等于已实现邮件发送。 |

索引与唯一约束：

- 普通 `idx_global_settings_updated`：`updated_at`, `id`。
- 唯一 `sqlite_autoindex_global_settings_1`：`uid`。

## navigation_items — 导航与按钮

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `title` | 中文文本 | `TEXT` | 否 | 未声明 | 必填；表单 text；最多字符 200 |
| `title_en` | 英文文本 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 200 |
| `kind` | 类型 | `TEXT` | 是 | 未声明 | 必填；表单 select；候选 route, external, anchor, button |
| `url_name` | 预设路由 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 select；最多字符 200；候选 home, team, research, publications, featured_publications, projects, patents, students, news, courses, contact, login, admin |
| `path` | 链接路径 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 2000 |
| `fragment` | 页面锚点 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 64 |
| `icon` | 图标 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 100 |
| `style` | 样式 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 select；候选 normal, primary, secondary |
| `location` | 位置 | `TEXT` | 是 | 未声明 | 必填；表单 select；候选 header, hero, footer, admin-sidebar |
| `visibility` | 可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `enabled` | 启用 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `sort_order` | 排序 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 integer；最小 -1000000；最大 1000000 |

索引与唯一约束：

- 普通 `idx_navigation_items_location`：`location`, `enabled`, `visibility`, `sort_order`, `id`。
- 普通 `idx_navigation_items_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_navigation_items_1`：`uid`。

## profiles — 教师与团队

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 中文姓名 | `TEXT` | 否 | 未声明 | 必填；表单 text；最多字符 200 |
| `name_en` | 英文姓名 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 200 |
| `role` | 团队角色 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `title` | 职称或头衔 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `organization` | 单位 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `lab` | 实验室/团队 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `avatar_key` | 头像媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media |
| `email` | 邮箱 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 email |
| `phone` | 电话 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `office` | 办公室 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `bio` | 中文简介 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `bio_en` | 英文简介 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `education` | 教育经历 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `experience` | 工作/科研经历 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `recruiting` | 招生说明 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `orcid` | ORCID | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `personal_homepage` | 个人主页 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `google_scholar` | Google Scholar | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `dblp` | DBLP | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `github` | GitHub | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `cnki` | CNKI | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `contact_visibility` | 联系方式可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `visibility` | 内容可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_active` | 启用成员 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `is_featured` | 首页精选 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |
| `orcid_value` | ORCID显示数值 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 0；手动配置的非负整数显示值；0 可显示，不会自动抓取第三方统计。 |
| `personal_homepage_value` | 个人主页显示数值 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 0；手动配置的非负整数显示值；0 可显示，不会自动抓取第三方统计。 |
| `google_scholar_value` | Google Scholar显示数值 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 0；手动配置的非负整数显示值；0 可显示，不会自动抓取第三方统计。 |
| `dblp_value` | DBLP显示数值 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 0；手动配置的非负整数显示值；0 可显示，不会自动抓取第三方统计。 |
| `github_value` | GitHub显示数值 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 0；手动配置的非负整数显示值；0 可显示，不会自动抓取第三方统计。 |
| `cnki_value` | CNKI显示数值 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 0；手动配置的非负整数显示值；0 可显示，不会自动抓取第三方统计。 |

外键：

- `avatar_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_profiles_admin_updated`：`updated_at`, `id`。
- 普通 `idx_profiles_visibility_active_sort`：`visibility`, `is_active`, `sort_order`, `id`。
- 普通 `idx_profiles_avatar_key`：`avatar_key`。
- 普通 `idx_profiles_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_profiles_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_profiles_1`：`uid`。

## research_interests — 研究方向

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 中文名称 | `TEXT` | 否 | 未声明 | 必填；表单 text |
| `name_en` | 英文名称 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `description` | 方向说明 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |
| `visibility` | 可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |

索引与唯一约束：

- 普通 `idx_research_interests_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_research_interests_1`：`uid`。

## publications — 论文

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `title` | 论文题名 | `TEXT` | 否 | 未声明 | 必填；表单 textarea |
| `source_citation` | 原始引用文本 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `authors` | 作者列表 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `venue` | 期刊或会议 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `year` | 年份 | `INTEGER` | 是 | 未声明 | 可选/按默认值；表单 integer；最小 1；最大 9999 |
| `volume` | 卷号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `issue` | 期号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `pages` | 页码/文章号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `doi` | DOI | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `url` | 外部链接 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `pdf_key` | PDF 媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media |
| `bibtex` | BibTeX | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `citation_gbt` | GB/T 引用 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `citation_elsevier` | Elsevier 引用 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `citation_apa` | APA 引用 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `citation_ieee` | IEEE 引用 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `highlight_gbt` | GB/T 高亮文本 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `highlight_elsevier` | Elsevier 高亮文本 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `highlight_apa` | APA 高亮文本 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `highlight_ieee` | IEEE 高亮文本 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `publication_type` | 论文类型 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `author_role` | 作者角色 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `corresponding_authors` | 通讯作者 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `index_type` | 收录/索引类型 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `display_tags` | 展示标签 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `abstract` | 摘要 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `keywords` | 关键词 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `pdf_visibility` | PDF 可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `visibility` | 内容可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_featured` | 首页精选 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |

外键：

- `pdf_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_publications_admin_updated`：`updated_at`, `id`。
- 普通 `idx_publications_visibility_year`：`visibility`, `year`, `sort_order`, `id`。
- 普通 `idx_publications_pdf_key`：`pdf_key`。
- 普通 `idx_publications_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_publications_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_publications_1`：`uid`。

## projects — 科研项目

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 项目名称 | `TEXT` | 否 | 未声明 | 必填；表单 textarea |
| `source` | 项目来源 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `fund_name` | 基金/计划名称 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `project_number` | 项目编号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `project_role` | 承担角色 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `principal` | 负责人 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `members` | 项目成员 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `start_date` | 开始日期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 date；格式 date |
| `end_date` | 结束日期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 date；格式 date |
| `status` | 项目状态 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `amount` | 经费金额（万元） | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 decimal；格式 decimal；按万元存储的非负十进制文本，最多四位小数；英文显示乘以 10,000。 |
| `summary` | 项目简介 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `visibility` | 内容可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_featured` | 首页精选 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |

索引与唯一约束：

- 普通 `idx_projects_admin_updated`：`updated_at`, `id`。
- 普通 `idx_projects_visibility_start_date`：`visibility`, `start_date`, `sort_order`, `id`。
- 普通 `idx_projects_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_projects_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_projects_1`：`uid`。

## patents — 专利与软件著作

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 名称 | `TEXT` | 否 | 未声明 | 必填；表单 textarea |
| `country` | 国家或地区 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `patent_type` | 类型 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `application_number` | 申请号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `grant_number` | 授权号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `application_date` | 申请日期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 date；格式 date |
| `grant_date` | 授权日期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 date；格式 date |
| `inventors` | 发明人/作者 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `owner` | 权利人 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `legal_status` | 法律状态 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `summary` | 简介 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `certificate_key` | 证书媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media |
| `visibility` | 内容可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_featured` | 首页精选 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |

外键：

- `certificate_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_patents_admin_updated`：`updated_at`, `id`。
- 普通 `idx_patents_certificate_key`：`certificate_key`。
- 普通 `idx_patents_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_patents_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_patents_1`：`uid`。

## students — 学生

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 中文姓名 | `TEXT` | 否 | 未声明 | 必填；表单 text |
| `name_en` | 英文姓名 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `avatar_key` | 头像媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media |
| `student_id` | 学号 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `degree` | 培养层次 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `category` | 分类 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `grade` | 年级 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `direction` | 研究方向 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `status` | 状态 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `email` | 邮箱 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 email |
| `homepage` | 个人主页 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 url |
| `enrollment_date` | 入学日期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 date；格式 date |
| `graduation_date` | 毕业日期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 date；格式 date |
| `destination` | 毕业去向 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `awards` | 获奖情况 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `bio` | 简介 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `contact_visibility` | 联系方式可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `visibility` | 内容可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_featured` | 首页精选 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |

外键：

- `avatar_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_students_admin_updated`：`updated_at`, `id`。
- 普通 `idx_students_group`：`visibility`, `category`, `status`, `sort_order`, `id`。
- 普通 `idx_students_avatar_key`：`avatar_key`。
- 普通 `idx_students_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_students_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_students_1`：`uid`。

## student_category_displays — 学生分类显示

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `key` | 分类 Key | `TEXT` | 否 | 未声明 | 必填；表单 text |
| `label` | 中文标签 | `TEXT` | 否 | 未声明 | 必填；表单 text |
| `label_en` | 英文标签 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `keywords` | 匹配关键词 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `enabled` | 启用 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `display_order` | 显示顺序 | `INTEGER` | 否 | `0` | 必填；表单 integer |

索引与唯一约束：

- 唯一 `sqlite_autoindex_student_category_displays_2`：`key`。
- 唯一 `sqlite_autoindex_student_category_displays_1`：`uid`。

## news — 新闻动态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `title` | 标题 | `TEXT` | 否 | 未声明 | 必填；表单 text；最多字符 500 |
| `slug` | Slug | `TEXT` | 否 | 未声明 | 必填；表单 text；最多字符 200 |
| `category` | 分类 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 500 |
| `cover_key` | 封面图 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media；最多字符 512 |
| `content` | 正文 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea；最多字符 500000；纯文本、Markdown 或安全 HTML；富文本图片/PDF 记录媒体 Key。 |
| `content_format` | 正文格式 | `TEXT` | 否 | `'plain'` | 必填；表单 select；值 plain, html, markdown |
| `related_publication_uid` | 关联论文 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 relation；最多字符 128 |
| `related_project_uid` | 关联项目 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 relation；最多字符 128 |
| `related_student_uid` | 关联学生 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 relation；最多字符 128 |
| `allow_comments` | 允许评论或留言入口 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1；控制详情留言表单入口；不是公共评论线程开关。 |
| `published_at` | 发布时间 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 datetime；格式 timestamp |
| `visibility` | 可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_featured` | 精选 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `sort_order` | 排序 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 integer；最小 -1000000；最大 1000000 |

外键：

- `related_student_uid` → `students.uid`；更新 RESTRICT，删除 SET NULL。
- `related_project_uid` → `projects.uid`；更新 RESTRICT，删除 SET NULL。
- `related_publication_uid` → `publications.uid`；更新 RESTRICT，删除 SET NULL。
- `cover_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_news_admin_updated`：`updated_at`, `id`。
- 普通 `idx_news_published`：`visibility`, `published_at`, `sort_order`, `id`。
- 普通 `idx_news_related_student_uid`：`related_student_uid`。
- 普通 `idx_news_related_project_uid`：`related_project_uid`。
- 普通 `idx_news_related_publication_uid`：`related_publication_uid`。
- 普通 `idx_news_cover_key`：`cover_key`。
- 普通 `idx_news_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_news_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_news_2`：`slug`。
- 唯一 `sqlite_autoindex_news_1`：`uid`。

## courses — 课程

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 课程名称 | `TEXT` | 否 | 未声明 | 必填；表单 text |
| `semester` | 开课学期 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `audience` | 授课对象 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `summary` | 课程简介 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `syllabus_key` | 教学大纲媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media |
| `material_key` | 课程材料媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media |
| `material_visibility` | 材料可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `references_text` | 参考资料 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `visibility` | 内容可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |
| `is_featured` | 首页精选 | `INTEGER` | 否 | `0` | 必填；表单 boolean；数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 必填；表单 integer |

外键：

- `material_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。
- `syllabus_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_courses_admin_updated`：`updated_at`, `id`。
- 普通 `idx_courses_visibility_semester`：`visibility`, `semester`, `sort_order`, `id`。
- 普通 `idx_courses_material_key`：`material_key`。
- 普通 `idx_courses_syllabus_key`：`syllabus_key`。
- 普通 `idx_courses_featured`：`visibility`, `is_featured`, `sort_order`, `id`。
- 普通 `idx_courses_visibility_sort`：`visibility`, `sort_order`, `id`。
- 唯一 `sqlite_autoindex_courses_1`：`uid`。

## messages — 留言

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 留言人姓名 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `email` | 留言人邮箱 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 email |
| `message_type` | 留言类型 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text |
| `subject` | 主题 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea |
| `content` | 留言正文 | `TEXT` | 否 | 未声明 | 必填；表单 textarea；新闻留言前缀保存新闻标题、链接和 UID；没有独立 news_uid 列。 |
| `attachment_key` | 附件媒体 Key | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 media；后台可维护附件引用，前台留言表单当前没有上传入口。 |
| `status` | 处理状态 | `TEXT` | 否 | `'new'` | 必填；表单 select；候选 new, read, replied, archived |
| `visibility` | 记录可见性 | `TEXT` | 否 | `'hidden'` | 必填；表单 select；值 public, authenticated, staff, owner, hidden |

外键：

- `attachment_key` → `media_assets.object_key`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 普通 `idx_messages_admin_status_created`：`status`, `created_at`, `id`。
- 普通 `idx_messages_status_created`：`status`, `created_at`, `id`。
- 普通 `idx_messages_attachment_key`：`attachment_key`。
- 唯一 `sqlite_autoindex_messages_1`：`uid`。

## media_assets — 媒体资源

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `object_key` | 受管理文件的对象 Key | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `title` | 标题 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 300 |
| `category` | 分类 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 text；最多字符 100 |
| `mime_type` | 媒体 MIME 类型 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `size` | 原文件大小，字节 | `INTEGER` | 否 | `0` | 最小 0 |
| `storage_kind` | 存储类型 | `TEXT` | 否 | `'local'` | 值 static, local, r2, external |
| `status` | 状态 | `TEXT` | 否 | `'active'` | 可选/按默认值；表单 select；值 active, trash |
| `checksum` | 文件校验摘要 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |

索引与唯一约束：

- 普通 `idx_media_assets_admin_status_updated`：`status`, `updated_at`, `id`。
- 普通 `idx_media_assets_status_category_mime`：`status`, `category`, `mime_type`, `id`。
- 唯一 `sqlite_autoindex_media_assets_2`：`object_key`。
- 唯一 `sqlite_autoindex_media_assets_1`：`uid`。

## translation_cache — 翻译缓存

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `source_hash` | 原文内容摘要 | `TEXT` | 否 | 未声明 | 最多字符 64 |
| `source_ref_key` | 来源记录与字段标识 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `source_text` | 来源原文 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `source_lang` | 来源语言 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `target_lang` | 目标语言 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `translated_text` | 译文 | `TEXT` | 是 | 未声明 | 可选/按默认值；表单 textarea；最多字符 500000 |
| `provider` | 翻译服务标识 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `status` | 翻译任务状态 | `TEXT` | 否 | `'pending'` | 值 pending, success, failed |
| `is_manual` | 人工维护 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `is_current` | 当前有效 | `INTEGER` | 否 | `0` | 可选/按默认值；表单 boolean；候选 1, 0；数据库 0/1 |
| `source_refs` | 来源及调度元数据 JSON | `TEXT` | 否 | `'[]'` | 系统维护/按业务校验；含来源表/UID/字段、来源更新时间，以及重试次数、重试时间和任务租约等元数据。 |
| `error_message` | 最近错误说明 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |

索引与唯一约束：

- 普通 `idx_translation_cache_admin_status_updated`：`status`, `is_current`, `updated_at`, `id`。
- 唯一 `idx_translation_cache_one_current`：`source_ref_key`, `target_lang`（条件索引，条件见结构 JSON）。
- 普通 `idx_translation_cache_ref_language`：`source_ref_key`, `target_lang`, `is_current`。
- 普通 `idx_translation_cache_hash_language`：`source_hash`, `target_lang`, `is_current`。
- 唯一 `sqlite_autoindex_translation_cache_1`：`uid`。

## auth_users — 用户

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `username` | 登录用户名 | `TEXT` | 否 | 未声明 | 最多字符 150 |
| `password_hash` | 密码哈希，不保存明文 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验；账号密码至少 6 位；字段保存哈希，不保存可恢复明文。 |
| `display_name` | 显示名称 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `email` | 邮箱 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `role_uid` | 所属角色 UID | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `status` | 账号状态 | `TEXT` | 否 | `'disabled'` | 值 active, disabled, locked |
| `must_change_password` | 要求修改密码 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `last_login_at` | 最近登录时间 | `TEXT` | 是 | 未声明 | 格式 timestamp |
| `visibility` | 记录可见性 | `TEXT` | 否 | `'hidden'` | 值 public, authenticated, staff, owner, hidden |

外键：

- `role_uid` → `auth_roles.uid`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 唯一 `ux_auth_users_username_nocase`：`username`。
- 唯一 `idx_auth_users_username_nocase`：`username`。
- 普通 `idx_auth_users_role_uid`：`role_uid`。
- 唯一 `sqlite_autoindex_auth_users_1`：`uid`。

## auth_roles — 角色

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `name` | 角色名称 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `level` | 角色等级 | `INTEGER` | 否 | `0` | 最小 0 |
| `description` | 角色说明 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `visibility_scopes` | 可见性范围 JSON 数组 | `TEXT` | 否 | `'["public"]'` | 系统维护/按业务校验 |
| `is_system` | 系统角色标记 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `is_active` | 角色启用标记 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 系统维护/按业务校验 |

索引与唯一约束：

- 唯一 `sqlite_autoindex_auth_roles_1`：`uid`。

## auth_permissions — 模块权限

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `role_uid` | 所属角色 UID | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `module` | 模块标识 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `can_view` | 允许查看 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `can_create` | 允许新建 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `can_edit` | 允许编辑 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `can_delete` | 允许删除 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `can_export` | 允许导出 | `INTEGER` | 否 | `0` | 数据库 0/1 |
| `sort_order` | 人工排序 | `INTEGER` | 否 | `0` | 系统维护/按业务校验 |

外键：

- `role_uid` → `auth_roles.uid`；更新 RESTRICT，删除 RESTRICT。

索引与唯一约束：

- 唯一 `ux_auth_permissions_role_module`：`role_uid`, `module`。
- 唯一 `idx_auth_permissions_role_module`：`role_uid`, `module`。
- 普通 `idx_auth_permissions_role_uid`：`role_uid`。
- 唯一 `sqlite_autoindex_auth_permissions_1`：`uid`。

## auth_sessions — 登录会话

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `user_uid` | 所属用户 UID | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `token_hash` | 会话令牌摘要 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `created_at` | 创建时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `last_seen_at` | 最近活动时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `idle_expires_at` | 空闲到期时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `expires_at` | 绝对到期时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `revoked_at` | 撤销时间 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `revoke_reason` | 撤销原因 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `user_agent_hash` | 客户端标识摘要 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |

外键：

- `user_uid` → `auth_users.uid`；更新 RESTRICT，删除 CASCADE。

索引与唯一约束：

- 普通 `idx_auth_sessions_user_active_expiry`：`user_uid`, `revoked_at`, `expires_at`。
- 普通 `idx_auth_sessions_revoked`：`revoked_at`, `id`。
- 普通 `idx_auth_sessions_expiry`：`expires_at`, `idle_expires_at`, `id`。
- 普通 `idx_auth_sessions_user_active`：`user_uid`, `revoked_at`, `created_at`, `id`。
- 唯一 `idx_auth_sessions_token_hash`：`token_hash`。
- 唯一 `sqlite_autoindex_auth_sessions_1`：`uid`。

## auth_login_throttles — 登录限流

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `key_hash` | 限流主体摘要 | `TEXT` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `scope` | 限制范围 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `failures` | 失败次数 | `INTEGER` | 否 | `0` | 系统维护/按业务校验 |
| `window_started_at` | 统计窗口开始 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `blocked_until` | 禁止请求截止 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `updated_at` | 最近更新 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `expires_at` | 记录到期 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |

索引与唯一约束：

- 普通 `idx_auth_login_throttles_expiry`：`expires_at`, `key_hash`。
- 唯一 `sqlite_autoindex_auth_login_throttles_1`：`key_hash`。

## public_action_throttles — 公共动作限流

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `key_hash` | 公共动作限流键摘要 | `TEXT` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `action` | 动作类型 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `scope` | 主体/网络范围 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `attempts` | 尝试次数 | `INTEGER` | 否 | `0` | 系统维护/按业务校验 |
| `window_started_at` | 窗口开始 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `blocked_until` | 阻止截止 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `updated_at` | 最近更新 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `expires_at` | 记录到期 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |

索引与唯一约束：

- 普通 `idx_public_action_throttles_action_scope`：`action`, `scope`, `updated_at`。
- 普通 `idx_public_action_throttles_expiry`：`expires_at`, `key_hash`。
- 唯一 `sqlite_autoindex_public_action_throttles_1`：`key_hash`。

## operation_logs — 操作日志

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部主键编号 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `uid` | 稳定业务标识 | `TEXT` | 否 | 未声明 | 最多字符 128 |
| `created_at` | 创建时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `updated_at` | 最近更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 格式 timestamp |
| `actor_uid` | 操作用户 UID，可空 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `actor_name` | 操作用户显示名 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `action` | 操作动作 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `module` | 所属模块 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `target_uid` | 目标记录 UID | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `summary` | 操作摘要 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |
| `detail_json` | 结构化详情 JSON | `TEXT` | 否 | `'{}'` | 系统维护/按业务校验 |
| `status` | 执行结果 | `TEXT` | 是 | 未声明 | 系统维护/按业务校验 |

索引与唯一约束：

- 普通 `idx_operation_logs_created_desc`：`created_at`, `id`。
- 普通 `idx_operation_logs_module_created`：`module`, `created_at`, `id`。
- 唯一 `sqlite_autoindex_operation_logs_1`：`uid`。

## cache_generations — 缓存版本

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `tag` | 缓存标签 | `TEXT` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `generation` | 缓存版本号 | `INTEGER` | 否 | `1` | 系统维护/按业务校验 |
| `updated_at` | 版本更新时间 | `TEXT` | 否 | 当前 UTC 时间 | 系统维护/按业务校验 |

索引与唯一约束：

- 唯一 `sqlite_autoindex_cache_generations_1`：`tag`。

## admin_mutation_guards — 并发修改保护

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `uid` | 并发修改保护标识 | `TEXT` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `module` | 受保护模块 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `target_uid` | 目标记录 UID | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `expected_updated_at` | 期望的记录版本时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `created_at` | 保护记录创建时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |

索引与唯一约束：

- 普通 `idx_admin_mutation_guards_created`：`created_at`。
- 普通 `idx_admin_mutation_guards_created_at`：`created_at`。
- 唯一 `sqlite_autoindex_admin_mutation_guards_1`：`uid`。

## auth_bootstrap_state — 首次管理员初始化状态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 初始化状态主键 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `completed_at` | 首次管理员初始化完成时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `user_uid` | 初始化管理员 UID | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |

## demo_seed_state — 演示数据状态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | 演示数据状态主键 | `INTEGER` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `dataset_version` | 数据集版本 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `seeded_at` | 填充时间 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `seed_digest` | 数据集摘要 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |

## _cms_migrations — 数据库结构状态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 | 表单/取值及使用说明 |
| --- | --- | --- | --- | --- | --- |
| `name` | 已应用的数据库结构文件名 | `TEXT` | 否 | 未声明 | 主键；系统维护/按业务校验 |
| `sha256` | 结构文件 SHA-256 摘要 | `TEXT` | 否 | 未声明 | 系统维护/按业务校验 |
| `applied_at` | 应用时间 | `TEXT` | 否 | 当前 UTC 时间 | 系统维护/按业务校验 |

索引与唯一约束：

- 唯一 `sqlite_autoindex__cms_migrations_1`：`name`。
