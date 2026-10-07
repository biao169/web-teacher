# 网站基本表结构说明

本文档说明主网站业务表结构，不包含文件传输工具相关表。所有主表默认包含 `id` 自增主键、`created_at` 创建时间和 `updated_at` 更新时间；多数业务表使用 `uid` 作为跨平台、跨导入导出的稳定标识。

## 通用字段约定

- `id`：数据库内部自增主键，不建议作为跨环境引用依据。
- `uid`：稳定唯一标识，用于后台编辑 URL、数据导入导出、跨表引用和迁移。
- `visibility`：前台可见性，常见值包括 `public`、`authenticated`、`staff`、`owner`、`hidden`。
- `is_featured`：是否在首页或重点区域展示。
- `sort_order`：人工排序，数值越小越靠前。
- `created_at`：记录创建时间。
- `updated_at`：记录最后更新时间。

## site_settings 网站设置

- `uid`：设置记录稳定标识。
- `is_active`：是否为当前启用的网站设置。
- `site_name`：中文网站名称。
- `site_name_en`：英文网站名称。
- `hero_title`：首页主标题。
- `hero_subtitle`：首页副标题或简介。
- `logo_key`：网站 Logo 媒体 key。
- `favicon_key`：浏览器图标媒体 key。
- `og_image_key`：社交分享预览图媒体 key。
- `seo_title`：页面 SEO 标题。
- `seo_description`：SEO 描述。
- `seo_keywords`：SEO 关键词。
- `footer_text`：页脚文本，可保存简单 HTML。
- `homepage_profile_uid`：首页重点展示教师/团队成员 uid。
- `homepage_publication_limit`：首页论文展示数量。
- `homepage_news_limit`：首页动态展示数量。

## global_settings 全局设置

- `uid`：全局设置稳定标识。
- `allow_public_registration`：是否允许公开注册。
- `allow_anonymous_messages`：是否允许匿名留言。
- `upload_max_size_mb`：媒体上传最大体积，单位 MB。
- `upload_allowed_extensions`：允许上传的扩展名列表。
- `media_trash_retention_days`：媒体回收站保留天数。
- `news_pdf_engine`：新闻 PDF 展示引擎。
- `news_pdf_allow_download`：是否允许 PDF 下载。
- `news_pdf_watermark`：PDF 水印文本。
- `translation_provider`：默认翻译服务。
- `translation_providers`：可用翻译服务列表。
- `libretranslate_url`、`libretranslate_api_key`：LibreTranslate 地址与密钥。
- `deepl_api_key`：DeepL API 密钥。
- `google_translate_api_key`：Google Translate API 密钥。
- `microsoft_translator_key`、`microsoft_translator_region`、`microsoft_translator_endpoint`：微软翻译配置。
- `mymemory_email`：MyMemory 翻译服务邮箱。
- `translation_batch_size`：翻译批处理条数。
- `translation_worker_count`：翻译并发 worker 数。
- `translation_timeout_seconds`：翻译请求超时时间。
- `translation_job_state`：翻译任务运行状态 JSON。
- `publication_metadata_provider`：默认论文元数据服务。
- `publication_metadata_providers`：可用论文元数据服务列表。
- `publication_display_style`：论文引用显示格式。
- `publication_suggestion_cache_seconds`：论文辅助输入缓存时长。
- `profile_suggestion_cache_seconds`：教师/团队辅助输入缓存时长。
- `project_suggestion_cache_seconds`：项目辅助输入缓存时长。
- `patent_suggestion_cache_seconds`：专利辅助输入缓存时长。
- `student_suggestion_cache_seconds`：学生辅助输入缓存时长。
- `news_suggestion_cache_seconds`：动态辅助输入缓存时长。
- `course_suggestion_cache_seconds`：课程辅助输入缓存时长。
- `patent_metadata_providers`：专利元数据平台列表。
- `patentsview_api_key`：PatentsView API 密钥。
- `epo_ops_client_id`、`epo_ops_client_secret`：EPO OPS 接入配置。
- `notify_email`：系统通知邮箱。

## navigation_items 导航与按钮

- `uid`：导航项稳定标识。
- `title`：中文显示文本。
- `title_en`：英文显示文本。
- `kind`：导航类型，如站内路由、外链、锚点、按钮。
- `url_name`：内部路由名。
- `path`：链接路径。
- `fragment`：页面锚点。
- `icon`：导航图标或短标识。
- `style`：链接样式，如普通、主按钮、次按钮。
- `location`：显示位置，如顶部、首页主视觉、页脚、后台侧栏。
- `visibility`：可见范围。
- `enabled`：是否启用。
- `sort_order`：排序。

## profiles 教师与团队

- `uid`：人员稳定标识。
- `name`：中文姓名。
- `name_en`：英文姓名。
- `role`：团队角色。
- `title`：职称或头衔。
- `organization`：单位。
- `lab`：团队或实验室。
- `avatar_key`：头像媒体 key。
- `email`：邮箱。
- `phone`：电话。
- `office`：办公室。
- `bio`：中文个人简介。
- `bio_en`：英文个人简介。
- `education`：教育经历。
- `experience`：工作或科研经历。
- `recruiting`：招生说明。
- `orcid`：ORCID。
- `personal_homepage`：个人主页。
- `google_scholar`：Google Scholar 链接。
- `dblp`：DBLP 链接。
- `github`：GitHub 链接。
- `cnki`：CNKI 链接。
- `contact_visibility`：联系方式可见范围。
- `visibility`：资料可见范围。
- `is_active`：是否在团队中启用。
- `is_featured`：是否首页展示。
- `sort_order`：排序。

## research_interests 研究方向

- `uid`：研究方向稳定标识。
- `name`：中文方向名称。
- `name_en`：英文方向名称。
- `description`：方向说明。
- `sort_order`：排序。
- `visibility`：可见范围。

## publications 论文

- `uid`：论文稳定标识。
- `title`：论文题名。
- `source_citation`：原始引用文本。
- `authors`：作者列表。
- `venue`：期刊或会议名称。
- `year`：发表年份。
- `volume`：卷号。
- `issue`：期号。
- `pages`：页码或文章号。
- `doi`：DOI。
- `url`：外部链接。
- `pdf_key`：PDF 媒体 key。
- `bibtex`：BibTeX。
- `citation_gbt`、`citation_elsevier`、`citation_apa`、`citation_ieee`：不同格式的引用文本。
- `highlight_gbt`、`highlight_elsevier`、`highlight_apa`、`highlight_ieee`：不同引用格式下需要高亮的作者或文本。
- `publication_type`：论文类型。
- `author_role`：作者角色，如第一作者、通讯作者、其他。
- `corresponding_authors`：通讯作者。
- `index_type`：收录或索引类型。
- `display_tags`：前台展示标签。
- `abstract`：摘要。
- `keywords`：关键词。
- `pdf_visibility`：PDF 可见范围。
- `visibility`：论文可见范围。
- `is_featured`：是否精选。
- `sort_order`：排序。

## projects 项目

- `uid`：项目稳定标识。
- `name`：项目名称。
- `source`：项目来源。
- `fund_name`：基金或计划名称。
- `project_number`：项目编号。
- `project_role`：承担角色，用于记录主持、参与、合作、指导等自由文本。
- `principal`：负责人。
- `members`：项目成员。
- `start_date`：开始日期。
- `end_date`：结束日期。
- `status`：项目状态。
- `amount`：经费金额。
- `summary`：项目简介。
- `visibility`：可见范围。
- `is_featured`：是否首页展示。
- `sort_order`：排序。

## patents 专利与软件著作

- `uid`：专利/软著稳定标识。
- `name`：名称。
- `country`：国家或地区。
- `patent_type`：类型。
- `application_number`：申请号。
- `grant_number`：授权号。
- `application_date`：申请日期。
- `grant_date`：授权日期。
- `inventors`：发明人或作者。
- `owner`：权利人。
- `legal_status`：法律状态。
- `summary`：简介。
- `certificate_key`：证书媒体 key。
- `visibility`：可见范围。
- `is_featured`：是否首页展示。
- `sort_order`：排序。

## students 学生

- `uid`：学生稳定标识。
- `name`：中文姓名。
- `name_en`：英文姓名。
- `avatar_key`：头像媒体 key。
- `student_id`：学号。
- `degree`：培养层次。
- `category`：学生分类。
- `grade`：年级。
- `direction`：研究方向。
- `status`：在读、毕业等状态。
- `email`：邮箱。
- `homepage`：个人主页。
- `enrollment_date`：入学日期。
- `graduation_date`：毕业日期。
- `destination`：毕业去向。
- `awards`：获奖情况。
- `bio`：简介。
- `contact_visibility`：联系方式可见范围。
- `visibility`：可见范围。
- `is_featured`：是否首页展示。
- `sort_order`：排序。

## student_category_displays 学生分类显示

- `uid`：分类显示规则稳定标识。
- `key`：分类 key。
- `label`：中文标签。
- `label_en`：英文标签。
- `keywords`：匹配关键词，用于把学生分类映射到展示组。
- `enabled`：是否启用。
- `display_order`：展示顺序。

## news 动态

- `uid`：动态稳定标识。
- `title`：标题。
- `slug`：URL 标识，需唯一。
- `category`：分类，支持多分类约定。
- `cover_key`：封面媒体 key。
- `content`：正文。
- `content_format`：正文格式，如 plain、html、markdown。
- `related_publication_uid`：关联论文 uid。
- `related_project_uid`：关联项目 uid。
- `related_student_uid`：关联学生 uid。
- `allow_comments`：是否允许评论或留言入口。
- `published_at`：发布时间。
- `visibility`：可见范围。
- `is_featured`：是否首页展示。
- `sort_order`：排序。

## courses 课程

- `uid`：课程稳定标识。
- `name`：课程名称。
- `semester`：开课学期。
- `audience`：授课对象。
- `summary`：课程简介。
- `syllabus_key`：教学大纲媒体 key。
- `material_key`：课件或材料媒体 key。
- `material_visibility`：课程材料可见范围。
- `references_text`：参考资料。
- `visibility`：课程可见范围。
- `is_featured`：是否首页展示。
- `sort_order`：排序。

## messages 留言

- `uid`：留言稳定标识。
- `name`：留言人姓名。
- `email`：留言人邮箱。
- `message_type`：留言类型，如招生、合作、论文、项目、课程或其他。
- `subject`：留言主题。
- `content`：留言内容。
- `attachment_key`：附件媒体 key。
- `status`：处理状态，如新留言、已读、已回复、归档。
- `visibility`：可见范围，通常后台使用。

## media_assets 媒体资源

- `uid`：媒体记录稳定标识。
- `object_key`：媒体对象 key，是业务表引用媒体的核心字段。
- `title`：媒体标题。
- `category`：媒体分类。
- `mime_type`：MIME 类型。
- `size`：文件大小。
- `storage_kind`：存储位置，如 static、local、r2、external。
- `status`：媒体状态，如 active、trash。
- `checksum`：文件校验值。

## translation_cache 翻译缓存

- `uid`：翻译缓存记录稳定标识。
- `source_hash`：源文本 hash，用于判断同一文本。
- `source_ref_key`：来源字段 key，通常包含表名、uid 和字段名。
- `source_text`：源文本。
- `source_lang`：源语言。
- `target_lang`：目标语言。
- `translated_text`：译文。
- `provider`：翻译服务来源。
- `status`：翻译状态，如 pending、success、failed。
- `is_manual`：是否人工维护。
- `is_current`：是否当前有效。
- `source_refs`：引用位置列表。
- `error_message`：失败原因或错误信息。

## operation_logs 后台操作日志

- `uid`：日志稳定标识。
- `actor_uid`：操作者 uid。
- `actor_name`：操作者名称。
- `action`：操作类型，如保存、批量更新、删除、导入、扫描、自动翻译等。
- `module`：操作模块。
- `target_uid`：目标记录 uid。
- `summary`：操作摘要。
- `detail_json`：操作细节 JSON。
- `status`：操作结果状态。

## auth_roles 权限角色

- `uid`：角色稳定标识。
- `name`：角色名称。
- `level`：权限层级。
- `description`：角色说明。
- `visibility_scopes`：该角色可访问的可见性范围。
- `is_system`：是否系统内置角色。
- `is_active`：是否启用。
- `sort_order`：排序。

## auth_users 用户账号

- `uid`：用户稳定标识。
- `username`：登录账号。
- `password_hash`：密码哈希。
- `display_name`：显示名称。
- `email`：邮箱。
- `role_uid`：关联角色 uid。
- `status`：账号状态。
- `must_change_password`：是否要求下次登录修改密码。
- `last_login_at`：最后登录时间。
- `visibility`：账号记录可见范围。

## auth_permissions 角色权限

- `uid`：权限记录稳定标识。
- `role_uid`：角色 uid。
- `module`：模块名。
- `can_view`：是否可查看。
- `can_create`：是否可创建。
- `can_edit`：是否可编辑。
- `can_delete`：是否可删除。
- `can_export`：是否可导出。
- `sort_order`：排序。
