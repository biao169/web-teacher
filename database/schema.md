# 0.15.38补充

媒体表新增可空只读字段 `original_filename TEXT`，最长255字符。主站新安装使用更新后的规范SQL；已有0.15.37库执行显式迁移，旧记录为空。操作见 `docs/features/media-management-step2.md`。以下保留原结构说明。

# 数据库字段字典 v0.5.0

日期：2026-09-12。权威DDL：database/migrations/common/0001_site.sql、0002_content.sql、0003_auth.sql、0004_media.sql；字段校验：backend/app/domain/content.py；基础服务契约：contracts/content.md。

## 统一规则

- uid文本标识；created_at/updated_at为UTC ISO8601，version从1起。所有业务修改必须通过版本服务或其后续同等约束，不允许管理表单任意写系统字段。
- content_records统一八类内容的题名/姓名/名称、简介、草稿/发布状态、可见性、启用、精选、排序、发布时间、所有者。
- title_zh对教师/学生表示姓名，对其他对象表示名称/题名；summary表示简介；八张业务子表的uid和kind用复合外键对应公共记录。
- 中文名称必填。默认draft+hidden，启用不等于公开。owner可见性必须有owner_uid。
- NULL金额与0不同；amount_yuan是人民币元整数，万元最多四位小数换算时×10000。UTC时间标准化；日期标准化为YYYY-MM-DD。
- users为空，不预置密码；会话只预留摘要字段。媒体默认private；第5步已实现上传、授权读取与回收，见contracts/media.md。
- 来源不明确、未清理的HTML不得标safe输出；正文仅存字段，清理器第8步接入前不公开输出。
- 外键保护关联、业务子表随主记录级联清理；成果被新闻/研究方向引用时不能直接删除，需显式解除关系。关联uid+kind外键阻止伪造类型。
- 每个字段下面列出实际DDL类型、空值、默认值和外键；枚举/CHECK/唯一组合/索引详见同目录迁移SQL。blank default表示没有默认值，NOT NULL字段必须由服务提供；SQLite PRAGMA对TEXT PRIMARY KEY的notnull显示0不代表业务接受空UID。
- 支撑表的建表已验收，身份/媒体已按第3/5步实现，设置/翻译业务尚待后续阶段；本阶段内容CRUD不是全站所有表的公开通用CRUD。
- site_profile仍为已有标题/介绍唯一来源；site_settings后续注册其他键，不能重复并存另一套站名配置。

## 内容字段校验范围

| 对象 | 字段 | 校验类型 | 字符上限 | 可空 | 枚举 |
| --- | --- | --- | --- | --- | --- |
| content_records | title_zh | text | 1000 | 否 | — |
| content_records | title_en | text | 1000 | 否 | — |
| content_records | summary_zh | text | 20000 | 否 | — |
| content_records | summary_en | text | 20000 | 否 | — |
| content_records | status | text | 500 | 否 | draft, published, archived |
| content_records | visibility | text | 500 | 否 | public, authenticated, staff, owner, hidden |
| content_records | enabled | bool | — | 否 | — |
| content_records | featured | bool | — | 否 | — |
| content_records | sort_order | int | — | 否 | — |
| content_records | published_at | time | 500 | 是 | — |
| content_records | owner_uid | uid | 500 | 是 | — |
| profiles | role | text | 500 | 否 | — |
| profiles | job_title_zh | text | 500 | 否 | — |
| profiles | job_title_en | text | 500 | 否 | — |
| profiles | institution_zh | text | 500 | 否 | — |
| profiles | institution_en | text | 500 | 否 | — |
| profiles | laboratory | text | 500 | 否 | — |
| profiles | recruitment_zh | text | 10000 | 否 | — |
| profiles | recruitment_en | text | 10000 | 否 | — |
| profiles | email | email | 500 | 否 | — |
| profiles | phone | text | 80 | 否 | — |
| profiles | office | text | 500 | 否 | — |
| profiles | contact_visibility | text | 500 | 否 | private, public, authenticated |
| profiles | photo_uid | uid | 500 | 是 | — |
| publications | venue | text | 500 | 否 | — |
| publications | publication_year | year | — | 是 | — |
| publications | volume | text | 500 | 否 | — |
| publications | issue | text | 500 | 否 | — |
| publications | pages | text | 500 | 否 | — |
| publications | doi | text | 300 | 否 | — |
| publications | source | text | 500 | 否 | — |
| publications | publication_type | text | 500 | 否 | — |
| publications | abstract_zh | text | 30000 | 否 | — |
| publications | abstract_en | text | 30000 | 否 | — |
| publications | original_citation | text | 10000 | 否 | — |
| publications | generated_citation | text | 10000 | 否 | — |
| publications | citation_format | text | 500 | 否 | — |
| publications | citation_version | int | — | 否 | — |
| publications | pdf_uid | uid | 500 | 是 | — |
| projects | source | text | 500 | 否 | — |
| projects | fund | text | 500 | 否 | — |
| projects | project_number | text | 500 | 否 | — |
| projects | participation_role | text | 500 | 否 | — |
| projects | principal_name | text | 500 | 否 | — |
| projects | start_date | date | 500 | 是 | — |
| projects | end_date | date | 500 | 是 | — |
| projects | project_status | text | 500 | 否 | — |
| projects | amount_yuan | money | — | 是 | — |
| patents | patent_type | text | 500 | 否 | — |
| patents | inventors | text | 3000 | 否 | — |
| patents | rights_holder | text | 500 | 否 | — |
| patents | application_number | text | 500 | 否 | — |
| patents | grant_number | text | 500 | 否 | — |
| patents | application_date | date | 500 | 是 | — |
| patents | grant_date | date | 500 | 是 | — |
| patents | region | text | 500 | 否 | — |
| patents | patent_status | text | 500 | 否 | — |
| patents | certificate_uid | uid | 500 | 是 | — |
| students | photo_uid | uid | 500 | 是 | — |
| students | category_uid | uid | 500 | 是 | — |
| students | degree_level | text | 500 | 否 | — |
| students | entry_year | year | — | 是 | — |
| students | research_direction | text | 500 | 否 | — |
| students | student_status | text | 500 | 否 | — |
| students | destination | text | 500 | 否 | — |
| students | email | email | 500 | 否 | — |
| students | phone | text | 80 | 否 | — |
| students | contact_visibility | text | 500 | 否 | private, public, authenticated |
| courses | semester | text | 500 | 否 | — |
| courses | audience | text | 500 | 否 | — |
| courses | references_text | text | 20000 | 否 | — |
| courses | syllabus_zh | text | 30000 | 否 | — |
| courses | syllabus_en | text | 30000 | 否 | — |
| news | slug | slug | 150 | 否 | — |
| news | category | text | 500 | 否 | — |
| news | cover_uid | uid | 500 | 是 | — |
| news | body_format | text | 500 | 否 | text, markdown, html |
| news | body_zh | text | 200000 | 否 | — |
| news | body_en | text | 200000 | 否 | — |
| news | allow_messages | bool | — | 否 | — |

## action_throttles

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| key_digest | TEXT | 1 | — | 0 | — |
| action | TEXT | 1 | — | 0 | — |
| window_start | TEXT | 1 | — | 0 | — |
| expires_at | TEXT | 1 | — | 0 | — |
| hit_count | INTEGER | 1 | 0 | 0 | — |

## audit_events

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| actor_uid | TEXT | 0 | — | 0 | users.uid |
| action | TEXT | 1 | — | 0 | — |
| object_uid | TEXT | 0 | — | 0 | — |
| outcome | TEXT | 1 | — | 0 | — |
| request_id | TEXT | 1 | — | 0 | — |

## cache_generations

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| scope | TEXT | 1 | — | 0 | — |
| generation | INTEGER | 1 | 1 | 0 | — |

## content_records

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | — |
| kind | TEXT | 1 | — | 0 | — |
| title_zh | TEXT | 1 | '' | 0 | — |
| title_en | TEXT | 1 | '' | 0 | — |
| summary_zh | TEXT | 1 | '' | 0 | — |
| summary_en | TEXT | 1 | '' | 0 | — |
| status | TEXT | 1 | 'draft' | 0 | — |
| visibility | TEXT | 1 | 'hidden' | 0 | — |
| enabled | INTEGER | 1 | 1 | 0 | — |
| featured | INTEGER | 1 | 0 | 0 | — |
| sort_order | INTEGER | 1 | 0 | 0 | — |
| published_at | TEXT | 0 | — | 0 | — |
| owner_uid | TEXT | 0 | — | 0 | users.uid |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |

## content_tags

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| content_uid | TEXT | 1 | — | 0 | content_records.uid |
| tag_uid | TEXT | 1 | — | 0 | tags.uid |

## course_materials

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| course_uid | TEXT | 1 | — | 0 | courses.uid |
| media_uid | TEXT | 1 | — | 0 | media_assets.uid |
| title | TEXT | 1 | — | 0 | — |
| access_policy | TEXT | 1 | 'private' | 0 | — |
| sort_order | INTEGER | 1 | 0 | 0 | — |

## courses

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'courses' | 0 | content_records.kind |
| semester | TEXT | 1 | '' | 0 | — |
| audience | TEXT | 1 | '' | 0 | — |
| references_text | TEXT | 1 | '' | 0 | — |
| syllabus_zh | TEXT | 1 | '' | 0 | — |
| syllabus_en | TEXT | 1 | '' | 0 | — |

## job_runs

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| job_type | TEXT | 1 | — | 0 | — |
| status | TEXT | 1 | — | 0 | — |
| cursor_text | TEXT | 0 | — | 0 | — |
| lease_until | TEXT | 0 | — | 0 | — |
| source_digest | TEXT | 0 | — | 0 | — |
| error_code | TEXT | 0 | — | 0 | — |

## media_assets

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | — |
| owner_uid | TEXT | 1 | — | 0 | users.uid |
| storage_key | TEXT | 1 | — | 0 | — |
| filename | TEXT | 1 | — | 0 | — |
| mime_type | TEXT | 1 | — | 0 | — |
| size_bytes | INTEGER | 1 | — | 0 | — |
| sha256 | TEXT | 0 | — | 0 | — |
| status | TEXT | 1 | — | 0 | — |
| access_policy | TEXT | 1 | 'private' | 0 | — |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |

## media_references

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| media_uid | TEXT | 1 | — | 0 | media_assets.uid |
| content_uid | TEXT | 1 | — | 0 | content_records.uid |
| field_path | TEXT | 1 | — | 0 | — |
| access_policy | TEXT | 1 | 'private' | 0 | — |

## messages

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| sender_name | TEXT | 1 | — | 0 | — |
| sender_email | TEXT | 1 | — | 0 | — |
| subject | TEXT | 1 | — | 0 | — |
| message_type | TEXT | 1 | 'contact' | 0 | — |
| body | TEXT | 1 | — | 0 | — |
| source_news_uid | TEXT | 0 | — | 0 | news.uid |
| status | TEXT | 1 | 'new' | 0 | — |
| internal_note | TEXT | 1 | '' | 0 | — |
| consent_at | TEXT | 1 | — | 0 | — |

## navigation_filters

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| navigation_uid | TEXT | 1 | — | 0 | navigation_items.uid |
| filter_key | TEXT | 1 | — | 0 | — |
| filter_value | TEXT | 1 | — | 0 | — |

## navigation_items

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| name_zh | TEXT | 1 | — | 0 | — |
| name_en | TEXT | 1 | '' | 0 | — |
| position | TEXT | 1 | — | 0 | — |
| icon | TEXT | 1 | '' | 0 | — |
| target_type | TEXT | 1 | — | 0 | — |
| target | TEXT | 1 | — | 0 | — |
| enabled | INTEGER | 1 | 1 | 0 | — |
| visibility | TEXT | 1 | 'public' | 0 | — |
| sort_order | INTEGER | 1 | 0 | 0 | — |

## news

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'news' | 0 | content_records.kind |
| slug | TEXT | 1 | '' | 0 | — |
| category | TEXT | 1 | '' | 0 | — |
| cover_uid | TEXT | 0 | — | 0 | media_assets.uid |
| body_format | TEXT | 1 | 'text' | 0 | — |
| body_zh | TEXT | 1 | '' | 0 | — |
| body_en | TEXT | 1 | '' | 0 | — |
| allow_messages | INTEGER | 1 | 0 | 0 | — |

## news_links

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| news_uid | TEXT | 1 | — | 0 | news.uid |
| target_uid | TEXT | 1 | — | 0 | content_records.uid |
| target_kind | TEXT | 1 | — | 0 | content_records.kind |

## patents

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'patents' | 0 | content_records.kind |
| patent_type | TEXT | 1 | '' | 0 | — |
| inventors | TEXT | 1 | '' | 0 | — |
| rights_holder | TEXT | 1 | '' | 0 | — |
| application_number | TEXT | 1 | '' | 0 | — |
| grant_number | TEXT | 1 | '' | 0 | — |
| application_date | TEXT | 0 | — | 0 | — |
| grant_date | TEXT | 0 | — | 0 | — |
| region | TEXT | 1 | '' | 0 | — |
| patent_status | TEXT | 1 | '' | 0 | — |
| certificate_uid | TEXT | 0 | — | 0 | media_assets.uid |

## profile_experiences

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| profile_uid | TEXT | 1 | — | 0 | profiles.uid |
| experience_type | TEXT | 1 | — | 0 | — |
| title_zh | TEXT | 1 | — | 0 | — |
| title_en | TEXT | 1 | '' | 0 | — |
| organization | TEXT | 1 | '' | 0 | — |
| start_date | TEXT | 0 | — | 0 | — |
| end_date | TEXT | 0 | — | 0 | — |
| sort_order | INTEGER | 1 | 0 | 0 | — |

## profile_links

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| profile_uid | TEXT | 1 | — | 0 | profiles.uid |
| provider | TEXT | 1 | — | 0 | — |
| url | TEXT | 1 | — | 0 | — |
| metric_value | INTEGER | 0 | — | 0 | — |

## profiles

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'profiles' | 0 | content_records.kind |
| role | TEXT | 1 | '' | 0 | — |
| job_title_zh | TEXT | 1 | '' | 0 | — |
| job_title_en | TEXT | 1 | '' | 0 | — |
| institution_zh | TEXT | 1 | '' | 0 | — |
| institution_en | TEXT | 1 | '' | 0 | — |
| laboratory | TEXT | 1 | '' | 0 | — |
| recruitment_zh | TEXT | 1 | '' | 0 | — |
| recruitment_en | TEXT | 1 | '' | 0 | — |
| email | TEXT | 1 | '' | 0 | — |
| phone | TEXT | 1 | '' | 0 | — |
| office | TEXT | 1 | '' | 0 | — |
| contact_visibility | TEXT | 1 | 'private' | 0 | — |
| photo_uid | TEXT | 0 | — | 0 | media_assets.uid |

## project_members

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| project_uid | TEXT | 1 | — | 0 | projects.uid |
| profile_uid | TEXT | 0 | — | 0 | profiles.uid |
| name | TEXT | 1 | — | 0 | — |
| member_role | TEXT | 1 | '' | 0 | — |
| position | INTEGER | 1 | 0 | 0 | — |

## projects

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'projects' | 0 | content_records.kind |
| source | TEXT | 1 | '' | 0 | — |
| fund | TEXT | 1 | '' | 0 | — |
| project_number | TEXT | 1 | '' | 0 | — |
| participation_role | TEXT | 1 | '' | 0 | — |
| principal_name | TEXT | 1 | '' | 0 | — |
| start_date | TEXT | 0 | — | 0 | — |
| end_date | TEXT | 0 | — | 0 | — |
| project_status | TEXT | 1 | '' | 0 | — |
| amount_yuan | INTEGER | 0 | — | 0 | — |

## publication_authors

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| publication_uid | TEXT | 1 | — | 0 | publications.uid |
| profile_uid | TEXT | 0 | — | 0 | profiles.uid |
| name | TEXT | 1 | — | 0 | — |
| affiliation | TEXT | 1 | '' | 0 | — |
| author_role | TEXT | 1 | '' | 0 | — |
| is_corresponding | INTEGER | 1 | 0 | 0 | — |
| position | INTEGER | 1 | — | 0 | — |

## publication_keywords

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| publication_uid | TEXT | 1 | — | 0 | publications.uid |
| label | TEXT | 1 | — | 0 | — |
| keyword_type | TEXT | 1 | — | 0 | — |

## publications

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'publications' | 0 | content_records.kind |
| venue | TEXT | 1 | '' | 0 | — |
| publication_year | INTEGER | 0 | — | 0 | — |
| volume | TEXT | 1 | '' | 0 | — |
| issue | TEXT | 1 | '' | 0 | — |
| pages | TEXT | 1 | '' | 0 | — |
| doi | TEXT | 1 | '' | 0 | — |
| source | TEXT | 1 | '' | 0 | — |
| publication_type | TEXT | 1 | '' | 0 | — |
| abstract_zh | TEXT | 1 | '' | 0 | — |
| abstract_en | TEXT | 1 | '' | 0 | — |
| original_citation | TEXT | 1 | '' | 0 | — |
| generated_citation | TEXT | 1 | '' | 0 | — |
| citation_format | TEXT | 1 | '' | 0 | — |
| citation_version | INTEGER | 1 | 0 | 0 | — |
| pdf_uid | TEXT | 0 | — | 0 | media_assets.uid |

## research_interests

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'research_interests' | 0 | content_records.kind |

## research_links

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| research_uid | TEXT | 1 | — | 0 | research_interests.uid |
| target_uid | TEXT | 1 | — | 0 | content_records.uid |
| target_kind | TEXT | 1 | — | 0 | content_records.kind |

## role_permissions

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| role_uid | TEXT | 1 | — | 0 | roles.uid |
| module | TEXT | 1 | — | 0 | — |
| action | TEXT | 1 | — | 0 | — |
| scope | TEXT | 1 | — | 0 | — |

## roles

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| name | TEXT | 1 | — | 0 | — |

## schema_migration_checksums

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | TEXT | 0 | — | 1 | — |
| sha256 | TEXT | 1 | — | 0 | — |

## schema_migrations

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | TEXT | 0 | — | 1 | — |
| applied_at | TEXT | 1 | — | 0 | — |

## sessions

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| user_uid | TEXT | 1 | — | 0 | users.uid |
| token_digest | TEXT | 1 | — | 0 | — |
| csrf_digest | TEXT | 1 | — | 0 | — |
| permission_version | INTEGER | 1 | — | 0 | — |
| expires_at | TEXT | 1 | — | 0 | — |
| revoked_at | TEXT | 0 | — | 0 | — |
| last_seen_at | TEXT | 1 | — | 0 | — |

## site_profile

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| id | INTEGER | 0 | — | 1 | — |
| title_zh | TEXT | 1 | — | 0 | — |
| title_en | TEXT | 1 | — | 0 | — |
| intro_zh | TEXT | 1 | — | 0 | — |
| intro_en | TEXT | 1 | — | 0 | — |
| version | INTEGER | 1 | 1 | 0 | — |

## site_settings

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| setting_key | TEXT | 1 | — | 0 | — |
| value_text | TEXT | 1 | — | 0 | — |
| value_type | TEXT | 1 | — | 0 | — |
| is_public | INTEGER | 1 | 0 | 0 | — |

## student_categories

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | — |
| name_zh | TEXT | 1 | — | 0 | — |
| name_en | TEXT | 1 | '' | 0 | — |
| match_words | TEXT | 1 | '' | 0 | — |
| sort_order | INTEGER | 1 | 0 | 0 | — |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |

## students

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | content_records.uid |
| kind | TEXT | 1 | 'students' | 0 | content_records.kind |
| photo_uid | TEXT | 0 | — | 0 | media_assets.uid |
| category_uid | TEXT | 0 | — | 0 | student_categories.uid |
| degree_level | TEXT | 1 | '' | 0 | — |
| entry_year | INTEGER | 0 | — | 0 | — |
| research_direction | TEXT | 1 | '' | 0 | — |
| student_status | TEXT | 1 | '' | 0 | — |
| destination | TEXT | 1 | '' | 0 | — |
| email | TEXT | 1 | '' | 0 | — |
| phone | TEXT | 1 | '' | 0 | — |
| contact_visibility | TEXT | 1 | 'private' | 0 | — |

## tags

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| name_zh | TEXT | 1 | — | 0 | — |
| name_en | TEXT | 1 | '' | 0 | — |

## translation_jobs

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| source_uid | TEXT | 1 | — | 0 | content_records.uid |
| source_version | INTEGER | 1 | — | 0 | — |
| field_name | TEXT | 1 | — | 0 | — |
| source_hash | TEXT | 1 | — | 0 | — |
| locale | TEXT | 1 | — | 0 | — |
| status | TEXT | 1 | — | 0 | — |
| lease_until | TEXT | 0 | — | 0 | — |
| attempts | INTEGER | 1 | 0 | 0 | — |
| next_retry_at | TEXT | 0 | — | 0 | — |
| error_code | TEXT | 0 | — | 0 | — |

## translations

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| source_uid | TEXT | 1 | — | 0 | content_records.uid |
| field_name | TEXT | 1 | — | 0 | — |
| source_hash | TEXT | 1 | — | 0 | — |
| locale | TEXT | 1 | — | 0 | — |
| translated_text | TEXT | 1 | — | 0 | — |
| is_manual | INTEGER | 1 | 0 | 0 | — |
| status | TEXT | 1 | — | 0 | — |

## user_roles

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |
| uid | TEXT | 0 | — | 1 | — |
| user_uid | TEXT | 1 | — | 0 | users.uid |
| role_uid | TEXT | 1 | — | 0 | roles.uid |

## users

| 字段 | SQL类型 | NOT NULL | 默认值 | 主键 | 外键目标 |
| --- | --- | --- | --- | --- | --- |
| uid | TEXT | 0 | — | 1 | — |
| username | TEXT | 1 | — | 0 | — |
| display_name | TEXT | 1 | '' | 0 | — |
| password_hash | TEXT | 0 | — | 0 | — |
| status | TEXT | 1 | 'disabled' | 0 | — |
| must_change_password | INTEGER | 1 | 1 | 0 | — |
| permission_version | INTEGER | 1 | 1 | 0 | — |
| version | INTEGER | 1 | 1 | 0 | — |
| created_at | TEXT | 1 | — | 0 | — |
| updated_at | TEXT | 1 | — | 0 | — |

## 迁移执行边界

SQLite：启动/CLI init按文件名依次执行缺失迁移，每个文件一个事务；异常回滚该文件，已完成的前序版本保留。schema_migration_checksums为本地迁移器额外维护表，禁止修改已执行文件来升级，应新增0003。
D1：prepare.py复制公共迁移到Worker发布目录，交给平台迁移工具执行；本地摘要表不是云端迁移机制。云端实测未完成。

本地验证数据库40表；此数是当前实现结果，不是追求表数量的设计目标。快传没有任何表混入教师数据库。


## 第3步身份增量（2026-09-12）

本地新库共42表，比第2步增加以下2表；旧内容字段没有改名或丢弃。

| 表/字段 | 类型/约束 | 用途 |
| --- | --- | --- |
| auth_keys.id | INTEGER PRIMARY KEY，必须为1 | 单例签名密钥标识 |
| auth_keys.secret | TEXT NOT NULL | secrets生成的256位十六进制密钥，登录前CSRF签名；禁止公开 |
| auth_write_guards.uid | TEXT PRIMARY KEY | 一次事务守卫随机标识 |
| auth_write_guards.allowed | INTEGER NOT NULL，命名CHECK active_authorization要求1 | 同事务检查失败则整批回滚，成功后删除该行 |

0003插入administrator/publication-editor/reader角色及白名单动作，无任何users记录。user_roles通过可信CLI赋予。所有会话与用户状态实际行为见contracts/auth.md。

原字段的运行语义：users.password_hash保存带参数的PBKDF2格式；permission_version改密/角色变化/禁用时递增；must_change_password限制后续创建账户首次访问；sessions.token_digest/csrf_digest仅摘要，expires_at绝对8小时、last_seen_at闲置30分钟。role_permissions scope严格all/owner。

auth_keys属于秘密配置不是一般可编辑业务记录；auth_write_guards是短暂事务断言，不需要业务version。audit_events为只追加事件，本步记录登录/退出/内容成功修改/账号策略变更，不存密码、令牌、原始内容。


## 第5步媒体增量

权威DDL：0004_media.sql。复用media_assets、media_references、course_materials与原媒体外键；未修改旧迁移文件。

| 表 | 新字段或职责 |
| --- | --- |
| media_assets | expires_at（上传到期UTC，可空）、purge_after（允许清理UTC，可空）；size_bytes包含全量预留，ready后sha256为全文件摘要 |
| media_uploads | media_uid主键且级联删除；slot唯一可空且非空只能1；receiving/busy布尔检查；控制全站任务和单次接收/存储 |
| media_parts | (media_uid,part_index)主键；index 0—19，size 1—1048576，sha256非空；state=pending/ready；随媒体级联删除 |
| media_write_guards | uid主键，valid CHECK(valid=1)；事务内状态/版本冲突检查，成功后删去，失败回滚 |

新索引：owner/status/created_at/uid、到期时间、媒体引用查询。触发器在所有直接字段、课程材料、通用引用插入/更新时要求ready；存在任意这些引用时禁止媒体状态离开ready。新增media角色授权只赋予管理员all和论文编辑者owner；reader不默认获得媒体库权限。


## 第6步使用说明

本步无新增或改写迁移；沿用0001—0004与校验和。启用已有八类明细、学生类别和关系表的实际管理操作。media_write_guards同时承载关系父版本及媒体ready检查；失败事务不留守卫行。字段上限、万元转换和管理DTO见contracts/content.md；完整字典不等同于公开接口白名单。
