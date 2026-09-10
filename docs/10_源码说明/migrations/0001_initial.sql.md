# migrations / 0001_initial.sql

## 文件定位

- **源码路径**：`migrations/0001_initial.sql`
- **文件类型**：迁移
- **功能定位**：数据库迁移脚本；按版本创建或升级持久化结构。
- **规模**：688 行，45612 字节
- **内容校验**：SHA-256 `d38087ea2a2b86f6f90bd7c12987d01e1b401480e282caa424a463f0015d3640`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 数据库变更

- 新建表：`media_assets`、`auth_roles`、`auth_users`、`auth_permissions`、`profiles`、`site_settings`、`global_settings`、`navigation_items`、`research_interests`、`publications`、`projects`、`patents`、`students`、`student_category_displays`、`news`、`courses`、`messages`、`translation_cache`、`operation_logs`
- 新建索引：`idx_media_assets_status_category_mime`、`idx_auth_users_role_uid`、`idx_auth_users_username_nocase`、`idx_auth_permissions_role_uid`、`idx_auth_permissions_role_module`、`idx_profiles_visibility_sort`、`idx_profiles_featured`、`idx_profiles_avatar_key`、`idx_site_settings_logo_key`、`idx_site_settings_favicon_key`、`idx_site_settings_og_image_key`、`idx_site_settings_homepage_profile_uid`、`idx_site_settings_one_active`、`idx_navigation_items_visibility_sort`、`idx_navigation_items_location`、`idx_research_interests_visibility_sort`、`idx_publications_visibility_sort`、`idx_publications_featured`、`idx_publications_pdf_key`、`idx_publications_visibility_year`、`idx_projects_visibility_sort`、`idx_projects_featured`、`idx_patents_visibility_sort`、`idx_patents_featured`、`idx_patents_certificate_key`、`idx_students_visibility_sort`、`idx_students_featured`、`idx_students_avatar_key`、`idx_students_group`、`idx_news_visibility_sort`、`idx_news_featured`、`idx_news_cover_key`、`idx_news_related_publication_uid`、`idx_news_related_project_uid`、`idx_news_related_student_uid`、`idx_news_published`、`idx_courses_visibility_sort`、`idx_courses_featured`、`idx_courses_syllabus_key`、`idx_courses_material_key`、`idx_messages_attachment_key`、`idx_messages_status_created`、`idx_translation_cache_hash_language`、`idx_translation_cache_ref_language`、`idx_translation_cache_one_current`、`idx_operation_logs_module_created`
- 新建触发器：无。
- 调整表：无。
- 用法：由迁移执行器按 `migrations/manifest.json` 的顺序执行，不应跳号或重复手工执行。

## 维护注意事项

- 已发布迁移保持不可变；后续结构调整应新增更高版本迁移。
