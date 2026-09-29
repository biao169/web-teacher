"""Shared administrator column choices; presentation never changes native fields or permissions."""
from .catalog import TABLES, TITLE, SECRET, Error, fields

# The first recommended native field identifies the row and remains frozen/visible.
RECOMMENDED = {
    'profiles': ('name', 'title', 'organization', 'is_active', 'is_featured', 'visibility'),
    'students': ('name', 'degree', 'grade', 'status', 'destination', 'visibility'),
    'student_category_displays': ('label', 'keywords', 'enabled', 'display_order'),
    'research_interests': ('name', 'description', 'sort_order', 'visibility'),
    'projects': ('name', 'principal', 'source', 'status', 'amount', 'is_featured'),
    'publications': ('title', 'authors', 'venue', 'year', 'is_featured', 'visibility'),
    'patents': ('name', 'patent_type', 'application_number', 'legal_status', 'is_featured'),
    'courses': ('name', 'semester', 'audience', 'is_featured', 'visibility'),
    'news': ('title', 'category', 'published_at', 'is_featured', 'visibility'),
    'navigation_items': ('title', 'kind', 'location', 'enabled', 'visibility', 'sort_order'),
    'site_settings': ('site_name', 'is_active', 'homepage_publication_limit', 'homepage_news_limit', 'updated_at'),
    'global_settings': ('uid', 'translation_provider', 'publication_metadata_provider', 'upload_max_size_mb', 'updated_at'),
    'translation_cache': ('source_text', 'translated_text', '__sources', 'target_lang', 'status', 'updated_at'),
    'media_assets': ('title', 'original_filename', '__preview', 'mime_type', 'size', '__usage', 'status'),
    'messages': ('subject', 'name', 'email', 'status', 'created_at'),
    'auth_users': ('username', 'display_name', 'role_uid', 'status', 'last_login_at'),
    'auth_roles': ('name', 'visibility_scopes', '__permissions', '__members', 'is_active'),
    'operation_logs': ('created_at', 'actor_name', 'module', 'action', 'status'),
}
OMITTED = {
    'content', 'bio', 'bio_en', 'education', 'experience', 'recruiting', 'abstract',
    'source_citation', 'references_text', 'bibtex', 'footer_text', 'detail_json',
}
EXTRA = {
    'media_assets': ('object_key', 'mime_type', 'size', 'status'),
    'translation_cache': ('source_ref_key', 'source_lang', 'source_text', 'target_lang', 'status', 'is_current', 'is_manual'),
    'operation_logs': ('uid','actor_uid','target_uid','summary'),
}
ACCOUNT_COLUMNS = {
    'auth_users': ('username', 'display_name', 'email', 'role_uid', 'status', 'must_change_password', 'visibility', 'last_login_at', 'updated_at'),
    'auth_roles': ('name', 'level', 'description', 'visibility_scopes', 'is_system', 'is_active', '__members', '__permissions', 'sort_order', 'updated_at'),
}
DERIVED = {'media_assets': {'__preview', '__usage'}, 'auth_roles': {'__members', '__permissions'}}


def column_layout(table):
    """Return ordered allowed/recommended columns, excluding secrets and long body/citation payloads."""
    if table not in RECOMMENDED:
        raise Error('功能没有列表配置', 404)
    if table=='translation_cache':
        from .translation_groups import COLUMNS
        return list(COLUMNS),RECOMMENDED[table]
    recommended = RECOMMENDED[table]
    from .ordering import ORDER_FIELDS
    recommended=tuple(dict.fromkeys((*recommended,*(name for name in ORDER_FIELDS if name in fields(table)))))
    candidates = ACCOUNT_COLUMNS.get(table, (TITLE[table], *fields(table), *EXTRA.get(table, ()), 'updated_at'))
    allowed = set(TABLES[table]['columns']) | DERIVED.get(table, set())
    columns = [name for name in dict.fromkeys((*recommended, *candidates))
               if name in allowed and name not in SECRET | OMITTED and not name.startswith(('citation_', 'highlight_'))]
    return columns, recommended
