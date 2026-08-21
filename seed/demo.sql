INSERT OR IGNORE INTO site_settings (uid, is_active, site_name, hero_title, hero_subtitle, seo_title, seo_description, seo_keywords, footer_text, homepage_profile_uid, homepage_publication_limit, homepage_news_limit)
VALUES ('site-default', 1, '教师个人与团队网站', '面向可靠智能系统的教学与科研', '这里展示教师简介、团队成员、论文、项目、专利、课程和新闻动态。后台可维护导航、首页按钮、团队照片和成果内容。', '教师个人主页', '教师个人与团队网站，展示科研项目、论文、专利、学生、课程与动态。', '教师主页,科研团队,论文,项目,专利,学生', '© 2026 教师个人与团队网站', 'profile-main-teacher', 5, 4);

INSERT OR IGNORE INTO global_settings (uid, allow_public_registration, allow_anonymous_messages, upload_max_size_mb, upload_allowed_extensions, news_pdf_engine, news_pdf_allow_download, translation_provider, translation_providers, libretranslate_url, libretranslate_api_key, deepl_api_key, google_translate_api_key, microsoft_translator_key, microsoft_translator_region, microsoft_translator_endpoint, mymemory_email, translation_batch_size, translation_worker_count, translation_timeout_seconds, publication_metadata_provider, publication_display_style, profile_suggestion_cache_seconds)
VALUES ('global-default', 0, 1, 20, '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv', 'native', 1, 'auto', 'auto,libretranslate,deepl_free,google_translate,microsoft_translator,mymemory,argos_local', '', '', '', '', '', '', '', '', 10, 4, 12, 'manual', 'gbt', 30);

INSERT OR IGNORE INTO navigation_items (uid, title, kind, path, location, style, enabled, sort_order, visibility) VALUES
('nav-home', '首页', 'route', '/', 'header', 'link', 1, 10, 'public'),
('nav-team', '团队', 'route', '/team', 'header', 'link', 1, 20, 'public'),
('nav-publications', '论文', 'route', '/publications', 'header', 'link', 1, 30, 'public'),
('nav-featured-publications', '代表论文', 'route', '/featured-publications', 'header', 'link', 1, 35, 'public'),
('nav-projects', '项目', 'route', '/projects', 'header', 'link', 1, 40, 'public'),
('nav-patents', '专利', 'route', '/patents', 'header', 'link', 1, 50, 'public'),
('nav-students', '学生', 'route', '/students', 'header', 'link', 1, 60, 'public'),
('nav-news', '动态', 'route', '/news', 'header', 'link', 1, 70, 'public'),
('nav-contact', '联系', 'route', '/contact', 'header', 'link', 1, 80, 'public'),
('hero-publications', '查看论文', 'button', '/publications', 'home_hero', 'primary', 1, 10, 'public'),
('hero-team', '团队成员', 'button', '/team', 'home_hero', 'secondary', 1, 20, 'public'),
('hero-contact', '联系留言', 'button', '/contact', 'home_hero', 'ghost', 1, 30, 'public');

INSERT OR IGNORE INTO profiles (uid, name, role, title, organization, lab, avatar_key, email, office, bio, education, experience, recruiting, orcid, google_scholar, github, contact_visibility, visibility, is_active, is_featured, sort_order)
VALUES
('profile-main-teacher', '张三', '教师', '教授 / 博士生导师', '某某大学', '智能系统实验室', 'profile/main-teacher.svg', 'teacher@example.edu.cn', '理工楼 A-501', '长期从事智能系统、可靠机器学习与教育数字化方向研究，欢迎对科研和工程实现都有兴趣的同学加入团队。', '博士，某某大学计算机科学与技术。', '主持多项国家级和省部级科研项目。', '招收机器学习、软件工程、教育技术方向博士和硕士研究生。', '0000-0000-0000-0000', 'https://scholar.google.com/', 'https://github.com/', 'public', 'public', 1, 1, 1),
('profile-member-li', '李四', '博士生', '2024 级博士研究生', '某某大学', '', 'profile/member-li.svg', 'student@example.edu.cn', '', '研究方向为可信机器学习与学术知识图谱。', '', '', '', '', '', '', 'public', 'public', 1, 1, 20);

INSERT OR IGNORE INTO research_interests (uid, name, description, sort_order, visibility) VALUES
('interest-ai', '可靠人工智能', '模型可靠性、可解释性与鲁棒性。', 1, 'public'),
('interest-edu', '教育数字化', '学习分析、教学资源智能组织与评价。', 2, 'public'),
('interest-system', '轻量系统工程', '低资源部署、边缘计算与 Web 系统。', 3, 'public');

INSERT OR IGNORE INTO publications (uid, title, authors, venue, year, volume, issue, pages, doi, citation_gbt, citation_apa, citation_ieee, publication_type, author_role, index_type, display_tags, keywords, visibility, pdf_visibility, is_featured, sort_order)
VALUES ('pub-demo-reliable-ai', 'Reliable AI Systems for Education', 'San Zhang; Si Li', 'Journal of Educational Intelligence', 2026, '12', '1', '15-28', '10.0000/example.2026.001', 'Zhang S, Li S. Reliable AI Systems for Education[J]. Journal of Educational Intelligence, 2026.', 'Zhang, S., & Li, S. (2026). Reliable AI Systems for Education. Journal of Educational Intelligence.', 'S. Zhang and S. Li, "Reliable AI Systems for Education," Journal of Educational Intelligence, 2026.', '期刊论文', 'corresponding', 'SCI', '期刊论文, SCI', 'AI; education; reliability', 'public', 'public', 1, 1);

INSERT OR IGNORE INTO projects (uid, name, source, project_number, principal, members, start_date, end_date, status, summary, visibility, is_featured, sort_order)
VALUES ('project-reliable-ai', '面向教育场景的可靠人工智能系统', '国家自然科学基金', 'NSFC-000000', '张三', '李四', '2026-01-01', '2029-12-31', '在研', '研究低资源、高可靠、可解释的教育智能系统。', 'public', 1, 1);

INSERT OR IGNORE INTO patents (uid, name, country, patent_type, application_number, application_date, inventors, owner, legal_status, visibility, is_featured, sort_order)
VALUES ('patent-ai-platform', '一种教学资源智能组织方法及系统', '中国', '发明专利', 'CN000000000', '2026-03-18', '张三; 李四', '某某大学', '申请中', 'public', 1, 1);

INSERT OR IGNORE INTO students (uid, name, avatar_key, degree, category, grade, direction, status, email, bio, visibility, contact_visibility, is_featured, sort_order)
VALUES ('student-li-si', '李四', 'students/li-si.svg', '博士', '在读博士', '2024', '可信机器学习', '在读', 'student@example.edu.cn', '关注可靠机器学习与知识图谱。', 'public', 'public', 1, 1);

INSERT OR IGNORE INTO student_category_displays (uid, key, label, keywords, enabled, display_order) VALUES
('cat-phd', 'phd', '在读博士', '博士,phd', 1, 1),
('cat-master', 'master', '在读硕士', '硕士,master', 1, 2),
('cat-alumni', 'alumni', '毕业生', '毕业,校友,alumni', 1, 3);

INSERT OR IGNORE INTO news (uid, title, slug, category, content, content_format, published_at, visibility, is_featured, sort_order)
VALUES ('news-welcome', '新版个人主页启动', 'welcome', '网站', '新版网站支持 Cloudflare Workers 与 Ubuntu 双平台部署，并提供标准导出包便于迁移。', 'plain', '2026-08-14', 'public', 1, 1);

INSERT OR IGNORE INTO courses (uid, name, semester, audience, summary, visibility, is_featured, sort_order)
VALUES ('course-ai-system', '人工智能系统实践', '2026 春', '研究生', '面向科研训练的 AI 系统工程课程。', 'public', 1, 1);

INSERT OR IGNORE INTO media_assets (uid, object_key, title, category, mime_type, size) VALUES
('media-profile-main', 'profile/main-teacher.svg', '教师照片', 'profile', 'image/svg+xml', 0),
('media-member-li', 'profile/member-li.svg', '团队成员照片', 'profile', 'image/svg+xml', 0),
('media-student-li', 'students/li-si.svg', '学生照片', 'students', 'image/svg+xml', 0);
