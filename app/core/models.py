from __future__ import annotations

from dataclasses import dataclass
from typing import Any


SCHEMA_VERSION = "2026.08.20.1"


@dataclass(frozen=True)
class Field:
    name: str
    label: str
    kind: str = "text"
    required: bool = False
    list: bool = False
    search: bool = False
    choices: tuple[str, ...] = ()


@dataclass(frozen=True)
class Table:
    name: str
    label: str
    title_field: str
    fields: tuple[Field, ...]

    @property
    def field_names(self) -> list[str]:
        return [field.name for field in self.fields]

    @property
    def list_fields(self) -> list[str]:
        selected = [field.name for field in self.fields if field.list]
        return selected or self.field_names[:4]

    @property
    def search_fields(self) -> list[str]:
        return [field.name for field in self.fields if field.search]


VISIBILITY = ("public", "authenticated", "staff", "owner", "hidden")


TABLES: tuple[Table, ...] = (
    Table(
        "site_settings",
        "站点设置",
        "site_name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("is_active", "启用", "bool", list=True),
            Field("site_name", "网站名称", required=True, list=True, search=True),
            Field("site_name_en", "网站名称 EN", search=True),
            Field("hero_title", "首页标题", list=True, search=True),
            Field("hero_subtitle", "首页简介", "textarea", search=True),
            Field("logo_key", "Logo 媒体 key", "file"),
            Field("favicon_key", "Favicon 媒体 key", "file"),
            Field("og_image_key", "分享图媒体 key", "file"),
            Field("seo_title", "SEO 标题", search=True),
            Field("seo_description", "SEO 描述", "textarea"),
            Field("seo_keywords", "SEO 关键词", search=True),
            Field("footer_text", "页脚文本", "textarea"),
            Field("homepage_profile_uid", "首页教师 uid", search=True),
            Field("homepage_publication_limit", "首页论文数量", "number"),
            Field("homepage_news_limit", "首页动态数量", "number"),
        ),
    ),
    Table(
        "global_settings",
        "通用设置",
        "uid",
        (
            Field("uid", "稳定标识", required=True, list=True),
            Field("allow_public_registration", "允许注册", "bool", list=True),
            Field("allow_anonymous_messages", "允许匿名留言", "bool", list=True),
            Field("upload_max_size_mb", "上传上限 MB", "number"),
            Field("upload_allowed_extensions", "允许扩展名", "textarea"),
            Field("media_trash_retention_days", "媒体回收站保留天数", "number"),
            Field("news_pdf_engine", "PDF 引擎", "select", choices=("native", "pdfjs")),
            Field("news_pdf_allow_download", "允许 PDF 下载", "bool"),
            Field("news_pdf_watermark", "PDF 水印"),
            Field("translation_provider", "默认翻译服务", "select", choices=("manual", "auto", "libretranslate", "deepl_free", "google_translate", "microsoft_translator", "mymemory", "argos_local")),
            Field("translation_providers", "启用翻译服务", "textarea"),
            Field("libretranslate_url", "LibreTranslate 地址", "url"),
            Field("libretranslate_api_key", "LibreTranslate API Key"),
            Field("deepl_api_key", "DeepL API Key"),
            Field("google_translate_api_key", "Google Translate API Key"),
            Field("microsoft_translator_key", "Microsoft Translator Key"),
            Field("microsoft_translator_region", "Microsoft Translator Region"),
            Field("microsoft_translator_endpoint", "Microsoft Translator Endpoint", "url"),
            Field("mymemory_email", "MyMemory 邮箱"),
            Field("translation_batch_size", "翻译批量数量", "number"),
            Field("translation_worker_count", "翻译并发线程", "number"),
            Field("translation_timeout_seconds", "翻译超时秒数", "number"),
            Field("translation_job_state", "翻译任务状态", "textarea"),
            Field("publication_metadata_provider", "论文元数据服务", "select", choices=("manual", "crossref", "openalex")),
            Field("publication_metadata_providers", "论文联网查验平台", "textarea"),
            Field("publication_display_style", "论文页显示格式", "select", choices=("gbt", "elsevier", "apa", "ieee", "bibtex", "source")),
            Field("publication_suggestion_cache_seconds", "论文填法提示缓存秒数", "number"),
            Field("profile_suggestion_cache_seconds", "团队填法提示缓存秒数", "number"),
            Field("project_suggestion_cache_seconds", "项目填法提示缓存秒数", "number"),
            Field("patent_suggestion_cache_seconds", "专利填法提示缓存秒数", "number"),
            Field("student_suggestion_cache_seconds", "学生填法提示缓存秒数", "number"),
            Field("news_suggestion_cache_seconds", "动态填法提示缓存秒数", "number"),
            Field("course_suggestion_cache_seconds", "课程填法提示缓存秒数", "number"),
            Field("patent_metadata_providers", "专利联网查验平台", "textarea"),
            Field("patentsview_api_key", "PatentsView API Key"),
            Field("epo_ops_client_id", "EPO OPS Client ID"),
            Field("epo_ops_client_secret", "EPO OPS Client Secret"),
            Field("notify_email", "通知邮箱", "email"),
        ),
    ),
    Table(
        "navigation_items",
        "导航与按钮",
        "title",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("title", "中文标题", required=True, list=True, search=True),
            Field("title_en", "英文标题", search=True),
            Field("kind", "类型", "select", list=True, choices=("route", "external", "anchor", "button")),
            Field("url_name", "路由名", search=True),
            Field("path", "路径或外链", list=True, search=True),
            Field("fragment", "锚点"),
            Field("icon", "图标"),
            Field("style", "样式", "select", choices=("link", "primary", "secondary", "ghost")),
            Field("location", "位置", "select", list=True, choices=("header", "home_hero", "footer", "admin_sidebar")),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("enabled", "启用", "bool", list=True),
            Field("sort_order", "排序", "number", list=True),
        ),
    ),
    Table(
        "profiles",
        "教师与团队",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "姓名", required=True, list=True, search=True),
            Field("name_en", "英文名", search=True),
            Field("role", "团队角色", list=True, search=True),
            Field("title", "职称", list=True, search=True),
            Field("organization", "单位", search=True),
            Field("lab", "团队/实验室", search=True),
            Field("avatar_key", "照片 key", "file"),
            Field("email", "邮箱", "email", list=True, search=True),
            Field("phone", "电话"),
            Field("office", "办公室", search=True),
            Field("bio", "简介", "textarea", search=True),
            Field("bio_en", "英文简介", "textarea", search=True),
            Field("education", "教育经历", "textarea"),
            Field("experience", "工作经历", "textarea"),
            Field("recruiting", "招生方向", "textarea"),
            Field("orcid", "ORCID"),
            Field("personal_homepage", "个人主页", "url"),
            Field("google_scholar", "Google Scholar", "url"),
            Field("dblp", "DBLP", "url"),
            Field("github", "GitHub", "url"),
            Field("cnki", "CNKI", "url"),
            Field("contact_visibility", "联系方式可见性", "select", choices=VISIBILITY),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_active", "启用", "bool", list=True),
            Field("is_featured", "首页展示", "bool"),
            Field("sort_order", "排序", "number", list=True),
        ),
    ),
    Table(
        "research_interests",
        "研究方向",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True),
            Field("name", "方向名称", required=True, list=True, search=True),
            Field("name_en", "英文名称", search=True),
            Field("description", "描述", "textarea", search=True),
            Field("sort_order", "排序", "number", list=True),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
        ),
    ),
    Table(
        "publications",
        "论文",
        "title",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("title", "题名", required=True, list=True, search=True),
            Field("source_citation", "原始引用", "textarea", search=True),
            Field("authors", "作者", "textarea", list=True, search=True),
            Field("venue", "期刊/会议", list=True, search=True),
            Field("year", "年份", "number", list=True, search=True),
            Field("volume", "卷号", search=True),
            Field("issue", "期号", search=True),
            Field("pages", "页码", search=True),
            Field("doi", "DOI", list=True, search=True),
            Field("url", "链接", "url"),
            Field("pdf_key", "PDF key", "file"),
            Field("bibtex", "BibTeX", "textarea"),
            Field("citation_gbt", "GB/T 引用", "textarea"),
            Field("citation_elsevier", "Elsevier 引用", "textarea"),
            Field("citation_apa", "APA 引用", "textarea"),
            Field("citation_ieee", "IEEE 引用", "textarea"),
            Field("publication_type", "论文类型", list=True, search=True),
            Field("author_role", "作者角色", "select", choices=("", "first", "corresponding", "other")),
            Field("index_type", "收录/分区", search=True),
            Field("display_tags", "前台展示标签", "textarea", search=True),
            Field("abstract", "摘要", "textarea", search=True),
            Field("keywords", "关键词", search=True),
            Field("pdf_visibility", "PDF 可见性", "select", choices=VISIBILITY),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_featured", "代表作", "bool", list=True),
            Field("sort_order", "排序", "number"),
        ),
    ),
    Table(
        "projects",
        "项目",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "项目名称", required=True, list=True, search=True),
            Field("source", "来源", list=True, search=True),
            Field("fund_name", "基金/计划", search=True),
            Field("project_number", "项目编号", list=True, search=True),
            Field("principal", "负责人", search=True),
            Field("members", "成员", search=True),
            Field("start_date", "开始日期", "date"),
            Field("end_date", "结束日期", "date"),
            Field("status", "状态", list=True, search=True),
            Field("amount", "金额", "number"),
            Field("summary", "简介", "textarea", search=True),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_featured", "首页展示", "bool", list=True),
            Field("sort_order", "排序", "number"),
        ),
    ),
    Table(
        "patents",
        "专利与软著",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "名称", required=True, list=True, search=True),
            Field("country", "国家", list=True, search=True),
            Field("patent_type", "类型", list=True, search=True),
            Field("application_number", "申请号", search=True),
            Field("grant_number", "授权号", list=True, search=True),
            Field("application_date", "申请日期", "date"),
            Field("grant_date", "授权日期", "date"),
            Field("inventors", "发明人/作者", search=True),
            Field("owner", "权利人", search=True),
            Field("legal_status", "法律状态", list=True, search=True),
            Field("summary", "简介", "textarea"),
            Field("certificate_key", "证书 key", "file"),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_featured", "首页展示", "bool", list=True),
            Field("sort_order", "排序", "number"),
        ),
    ),
    Table(
        "students",
        "学生",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "姓名", required=True, list=True, search=True),
            Field("name_en", "英文名", search=True),
            Field("avatar_key", "照片 key", "file"),
            Field("student_id", "学号", search=True),
            Field("degree", "层次", list=True, search=True),
            Field("category", "分组", list=True, search=True),
            Field("grade", "年级", list=True, search=True),
            Field("direction", "方向", search=True),
            Field("status", "状态", list=True, search=True),
            Field("email", "邮箱", "email", search=True),
            Field("homepage", "主页", "url"),
            Field("enrollment_date", "入学日期", "date"),
            Field("graduation_date", "毕业日期", "date"),
            Field("destination", "毕业去向", search=True),
            Field("awards", "获奖", "textarea"),
            Field("bio", "简介", "textarea", search=True),
            Field("contact_visibility", "联系方式可见性", "select", choices=VISIBILITY),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_featured", "首页展示", "bool", list=True),
            Field("sort_order", "排序", "number"),
        ),
    ),
    Table(
        "student_category_displays",
        "学生分组",
        "label",
        (
            Field("uid", "稳定标识", required=True, list=True),
            Field("key", "分组 key", required=True, list=True, search=True),
            Field("label", "中文标签", required=True, list=True, search=True),
            Field("label_en", "英文标签", search=True),
            Field("keywords", "匹配关键词", "textarea", search=True),
            Field("enabled", "启用", "bool", list=True),
            Field("display_order", "排序", "number", list=True),
        ),
    ),
    Table(
        "news",
        "动态",
        "title",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("title", "标题", required=True, list=True, search=True),
            Field("slug", "URL 标识", required=True, list=True, search=True),
            Field("category", "分类", list=True, search=True),
            Field("cover_key", "封面 key", "file"),
            Field("content", "内容", "textarea", search=True),
            Field("content_format", "格式", "select", choices=("plain", "html", "markdown")),
            Field("related_publication_uid", "关联论文 uid"),
            Field("related_project_uid", "关联项目 uid"),
            Field("related_student_uid", "关联学生 uid"),
            Field("allow_comments", "允许评论", "bool"),
            Field("published_at", "发布时间", "datetime", list=True),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_featured", "首页展示", "bool", list=True),
            Field("sort_order", "排序", "number"),
        ),
    ),
    Table(
        "courses",
        "课程",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "课程名称", required=True, list=True, search=True),
            Field("semester", "学期", list=True, search=True),
            Field("audience", "授课对象", list=True, search=True),
            Field("summary", "简介", "textarea", search=True),
            Field("syllabus_key", "大纲 key", "file"),
            Field("material_key", "课件 key", "file"),
            Field("material_visibility", "资料可见性", "select", choices=VISIBILITY),
            Field("references_text", "参考资料", "textarea"),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
            Field("is_featured", "首页展示", "bool", list=True),
            Field("sort_order", "排序", "number"),
        ),
    ),
    Table(
        "messages",
        "留言",
        "subject",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "姓名", list=True, search=True),
            Field("email", "邮箱", "email", list=True, search=True),
            Field("message_type", "类型", "select", choices=("recruiting", "cooperation", "paper", "project", "course", "other")),
            Field("subject", "主题", required=True, list=True, search=True),
            Field("content", "内容", "textarea", search=True),
            Field("attachment_key", "附件 key", "file"),
            Field("status", "状态", "select", list=True, choices=("new", "read", "replied", "archived")),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
        ),
    ),
    Table(
        "media_assets",
        "媒体库",
        "object_key",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("object_key", "对象 key", required=True, list=True, search=True),
            Field("storage_kind", "存储位置", "select", list=True, choices=("static", "local", "r2", "external")),
            Field("title", "标题", list=True, search=True),
            Field("category", "分类", list=True, search=True),
            Field("mime_type", "MIME 类型", list=True, search=True),
            Field("size", "大小", "number", list=True),
            Field("status", "状态", "select", list=True, choices=("active", "trash")),
            Field("checksum", "校验值"),
        ),
    ),
    Table(
        "translation_cache",
        "翻译缓存",
        "source_text",
        (
            Field("uid", "稳定标识", required=True, list=True),
            Field("source_hash", "原文 hash", list=True, search=True),
            Field("source_ref_key", "来源 key", search=True),
            Field("source_text", "原文", "textarea", list=True, search=True),
            Field("source_lang", "源语言"),
            Field("target_lang", "目标语言"),
            Field("translated_text", "译文", "textarea", list=True, search=True),
            Field("provider", "服务"),
            Field("status", "状态", "select", choices=("pending", "success", "failed")),
            Field("is_manual", "人工维护", "bool"),
            Field("is_current", "当前有效", "bool"),
            Field("source_refs", "引用位置", "textarea"),
            Field("error_message", "错误", "textarea"),
        ),
    ),
    Table(
        "autofetch_logs",
        "论文补全日志",
        "query",
        (
            Field("uid", "稳定标识", required=True, list=True),
            Field("source", "来源", list=True, search=True),
            Field("query", "查询", list=True, search=True),
            Field("success", "成功", "bool", list=True),
            Field("message", "消息", "textarea", list=True, search=True),
            Field("changes_json", "变更 JSON", "textarea"),
            Field("publication_uid", "论文 uid", search=True),
        ),
    ),
    Table(
        "operation_logs",
        "后台操作审计",
        "summary",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("actor_uid", "操作者 UID", list=True, search=True),
            Field("actor_name", "操作者", list=True, search=True),
            Field("action", "操作", "select", list=True, search=True, choices=("save", "quick_update", "batch_update", "delete", "trash", "restore", "import_restore", "scan", "auto_translate", "inline_update", "system")),
            Field("module", "功能模块", list=True, search=True),
            Field("target_uid", "目标 UID", list=True, search=True),
            Field("summary", "摘要", "textarea", list=True, search=True),
            Field("detail_json", "详情 JSON", "textarea"),
            Field("status", "状态", "select", list=True, choices=("success", "warning", "failed")),
        ),
    ),
    Table(
        "auth_roles",
        "权限角色",
        "name",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("name", "角色名称", required=True, list=True, search=True),
            Field("level", "权限层级", "number", list=True),
            Field("description", "说明", "textarea", search=True),
            Field("visibility_scopes", "可访问可见范围", "textarea", list=True, search=True),
            Field("is_system", "系统角色", "bool", list=True),
            Field("is_active", "启用", "bool", list=True),
            Field("sort_order", "排序", "number", list=True),
        ),
    ),
    Table(
        "auth_users",
        "用户账号",
        "username",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("username", "登录账号", required=True, list=True, search=True),
            Field("password_hash", "密码哈希"),
            Field("display_name", "显示名称", list=True, search=True),
            Field("email", "邮箱", "email", list=True, search=True),
            Field("role_uid", "角色 UID", list=True, search=True),
            Field("status", "状态", "select", list=True, choices=("active", "disabled")),
            Field("must_change_password", "需改密", "bool"),
            Field("last_login_at", "最后登录", "datetime", list=True),
            Field("visibility", "可见范围", "select", choices=VISIBILITY),
        ),
    ),
    Table(
        "auth_permissions",
        "角色权限",
        "module",
        (
            Field("uid", "稳定标识", required=True, list=True, search=True),
            Field("role_uid", "角色 UID", required=True, list=True, search=True),
            Field("module", "功能模块", required=True, list=True, search=True),
            Field("can_view", "查看", "bool", list=True),
            Field("can_create", "新增", "bool", list=True),
            Field("can_edit", "编辑", "bool", list=True),
            Field("can_delete", "删除", "bool", list=True),
            Field("can_export", "导出", "bool", list=True),
            Field("sort_order", "排序", "number", list=True),
        ),
    ),
)


TABLE_MAP: dict[str, Table] = {table.name: table for table in TABLES}


def table_for(name: str) -> Table:
    try:
        return TABLE_MAP[name]
    except KeyError as exc:
        raise ValueError(f"Unknown table: {name}") from exc


def public_filter(row: dict[str, Any]) -> bool:
    return str(row.get("visibility") or "public") == "public"


def int_value(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
