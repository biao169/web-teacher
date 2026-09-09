const UID_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u;
const OBJECT_KEY_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9][A-Za-z0-9._\/-]{0,511}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SAFE_ANCHOR_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const DECIMAL_RE = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/u;
const INTEGER_RE = /^-?(?:0|[1-9]\d*)$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;

export const PAGE_SIZES = Object.freeze([10, 20, 50, 100]);
export const MAX_BATCH = 25;
export const MAX_EXPORT_ROWS = 20_000;
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_RICH_TEXT_NODES = 5_000;
export const MAX_RICH_TEXT_TEXT = 500_000;
export const SUPPORTED_UPLOAD_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'pdf', 'zip']);

const visibility = ['public', 'authenticated', 'staff', 'owner', 'hidden'];
const boolOptions = [{ value: 1, label: '是' }, { value: 0, label: '否' }];
const navigationRoutes = [
  { value: 'home', label: '首页' }, { value: 'team', label: '团队' }, { value: 'research', label: '研究方向' },
  { value: 'publications', label: '论文' }, { value: 'featured_publications', label: '精选论文' }, { value: 'projects', label: '项目' },
  { value: 'patents', label: '专利软著' }, { value: 'students', label: '学生' }, { value: 'news', label: '动态' },
  { value: 'courses', label: '课程' }, { value: 'contact', label: '联系' }, { value: 'login', label: '登录' }, { value: 'admin', label: '后台' },
];

function defaultPlaceholder(field) {
  if (field.type === 'select') return `请选择${field.label}`;
  if (field.type === 'date') return `请选择${field.label}`;
  if (field.type === 'datetime') return `请选择${field.label}的日期和时间`;
  if (field.type === 'media') return `请选择${field.label}`;
  if (field.type === 'relation') return `搜索并选择${field.label}`;
  if (field.type === 'secret') return `留空则保持现有${field.label}`;
  if (field.type === 'email') return '例如：name@example.com';
  if (field.type === 'url') return '例如：https://example.com';
  if (field.type === 'textarea') return `请输入${field.label}`;
  if (field.type === 'integer') return `请输入${field.label}`;
  if (field.type === 'boolean') return `设置${field.label}`;
  return `请输入${field.label}`;
}

function defaultHelp(field) {
  if (field.readonly) return `${field.label}由系统维护，仅用于查看。`;
  if (field.type === 'boolean') return `控制“${field.label}”是否启用，保存后立即按当前状态生效。`;
  if (field.type === 'select') return `请选择${field.label}；此项${field.required ? '必填' : '可选'}。`;
  if (field.type === 'date') return `请选择${field.label}；日期按本地时区保存。`;
  if (field.type === 'datetime') return `请选择${field.label}；时间按本地时区录入并统一存储。`;
  if (field.type === 'media') return `从媒体库选择${field.label}，系统将保存受管理媒体的 object key。`;
  if (field.type === 'relation') return `搜索并关联一条${field.label}记录；清空后将解除当前关联。`;
  if (field.type === 'secret') return `选择“替换”后填写新值；留空或保持现状都不会回显、覆盖已有密钥。`;
  if (field.type === 'email') return `填写可用的邮箱地址；此项${field.required ? '必填' : '可选'}。`;
  if (field.type === 'url') return `填写完整的 HTTPS 地址；此项${field.required ? '必填' : '可选'}。`;
  if (field.type === 'integer') {
    const range = field.min !== undefined || field.max !== undefined ? `；允许范围 ${field.min ?? '不限'} 至 ${field.max ?? '不限'}` : '';
    return `填写${field.label}的整数值${range}。`;
  }
  const length = field.maxLength ? `，最多 ${field.maxLength} 个字符` : '';
  return `填写${field.label}；此项${field.required ? '必填' : '可选'}${length}。`;
}

function withGuidance(base, options = {}) {
  const field = { ...base, ...options };
  return {
    ...field,
    placeholder: field.placeholder || defaultPlaceholder(field),
    help: field.help || defaultHelp(field),
  };
}

const text = (key, label, options = {}) => withGuidance({ key, label, type: 'text', maxLength: 500 }, options);
const textarea = (key, label, options = {}) => withGuidance({ key, label, type: 'textarea', maxLength: 20000 }, options);
const integer = (key, label, options = {}) => withGuidance({ key, label, type: 'integer' }, options);
const boolean = (key, label, options = {}) => withGuidance({ key, label, type: 'boolean', options: boolOptions }, options);
const select = (key, label, values, options = {}) => withGuidance({ key, label, type: 'select', options: values.map(v => typeof v === 'string' ? ({ value: v, label: v }) : v) }, options);
const secret = (key, label, options = {}) => withGuidance({ key, label, type: 'secret', secret: true, maxLength: 4096 }, options);
const media = (key, label, accept, options = {}) => withGuidance({ key, label, type: 'media', accept, maxLength: 512 }, options);
const relation = (key, label, relationResource, relationLabelField, options = {}) => withGuidance({ key, label, type: 'relation', relationResource, relationLabelField, maxLength: 128 }, options);
const datetime = (key, label, options = {}) => withGuidance({ key, label, type: 'datetime' }, options);

export const RESOURCE_CATALOG = Object.freeze({
  'site-settings': {
    key: 'site-settings', table: 'site_settings', permission: ['site_settings'], label: '网站设置', singleton: false,
    titleField: 'site_name', search: ['site_name', 'site_name_en', 'hero_title'], filters: ['is_active'],
    list: ['uid', 'site_name', 'site_name_en', 'is_active', 'updated_at'], defaultSort: ['updated_at', 'desc'],
    fields: [
      text('site_name', '中文站点名称', { required: true, maxLength: 200, group: '品牌' }),
      text('site_name_en', '英文站点名称', { maxLength: 200, group: '品牌' }),
      text('hero_title', '首页主标题', { maxLength: 300, group: '首页' }),
      textarea('hero_subtitle', '首页副标题', { maxLength: 2000, group: '首页' }),
      media('logo_key', 'Logo', ['image/*'], { group: '媒体' }),
      media('favicon_key', '浏览器图标', ['image/*'], { group: '媒体' }),
      media('og_image_key', '社交分享图', ['image/*'], { group: '媒体' }),
      text('seo_title', 'SEO 标题', { maxLength: 300, group: 'SEO' }),
      textarea('seo_description', 'SEO 描述', { maxLength: 1000, group: 'SEO' }),
      text('seo_keywords', 'SEO 关键词', { maxLength: 1000, group: 'SEO' }),
      textarea('footer_text', '页脚内容（支持 HTML）', { maxLength: 10000, group: '页脚', help: '前台仅显示此处配置的页脚正文，不再自动追加版权或系统署名。支持 p、div、span、small、br、strong、em、列表和 HTTP/HTTPS/mailto 链接，可用 text-align 居中；脚本、事件和嵌入代码会被过滤。留空隐藏正文。' }),
      text('homepage_profile_uid', '旧版首页成员（兼容保留）', { maxLength: 128, readonly: true, group: '首页', help: '首页现自动显示公开、启用且设为精选的首位教师，按教师与团队的排序升序排列；此旧值保留，不再决定首页人物。' }),
      integer('homepage_publication_limit', '首页论文数量', { min: 0, max: 100, group: '首页' }),
      integer('homepage_news_limit', '首页动态数量', { min: 0, max: 100, group: '首页' }),
      boolean('is_active', '当前启用', { group: '状态' })
    ], quick: ['is_active'], invalidate: ['module:site_settings', 'public:site', 'public:layout', 'public:home', 'public:seo']
  },
  'global-settings': {
    key: 'global-settings', table: 'global_settings', permission: ['global_settings'], label: '全局设置', singleton: false,
    titleField: 'uid', search: ['uid', 'translation_provider', 'publication_metadata_provider'], filters: [],
    list: ['uid', 'allow_public_registration', 'allow_anonymous_messages', 'translation_provider', 'updated_at'], defaultSort: ['updated_at', 'desc'],
    fields: [
      boolean('allow_public_registration', '允许公开注册', { group: '访问' }),
      boolean('allow_anonymous_messages', '允许匿名留言', { group: '访问' }),
      integer('upload_max_size_mb', '上传上限（MB）', { min: 1, max: 20, group: '媒体', help: '管理端采用 20 MB 绝对安全上限；实际限制还会取运行环境存储上限的较小值。' }),
      textarea('upload_allowed_extensions', '允许上传扩展名', { format: 'json', jsonType: 'array', maxLength: 2000, group: '媒体', help: '使用 JSON 数组，例如 ["png","jpg","mp4","webm","pdf"]。留空数组可暂停所有上传。' }),
      integer('media_trash_retention_days', '回收站保留天数', { min: 1, max: 3650, group: '媒体' }),
      select('news_pdf_engine', 'PDF 展示引擎', ['browser', 'pdfjs'], { group: 'PDF' }),
      boolean('news_pdf_allow_download', '允许 PDF 下载', { group: 'PDF' }),
      text('news_pdf_watermark', 'PDF 水印说明', { maxLength: 500, group: 'PDF' }),
      select('translation_provider', '默认翻译服务', ['libretranslate', 'deepl', 'google', 'microsoft', 'mymemory'], { group: '翻译', help: '留空默认使用无需密钥的 MyMemory。指定服务缺少配置时，在允许的服务中选择可用项；保存后下一次任务立即读取新配置。' }),
      textarea('translation_providers', '可用翻译服务 JSON', { format: 'json', jsonType: 'array', maxLength: 10000, group: '翻译', help: '[] 表示自动选择；也可填写允许使用及失败后切换的服务，例如 ["libretranslate","mymemory"]。非空列表以外的服务不会使用。' }),
      text('libretranslate_url', 'LibreTranslate 地址', { type: 'url', maxLength: 2000, group: '翻译', help: '填写自建服务地址或完整 /translate 地址；官方托管服务还需配置 API Key。' }),
      secret('libretranslate_api_key', 'LibreTranslate API Key', { group: '翻译密钥' }),
      secret('deepl_api_key', 'DeepL API Key', { group: '翻译密钥' }),
      secret('google_translate_api_key', 'Google Translate API Key', { group: '翻译密钥' }),
      secret('microsoft_translator_key', 'Microsoft Translator Key', { group: '翻译密钥' }),
      text('microsoft_translator_region', 'Microsoft 区域', { maxLength: 200, group: '翻译' }),
      text('microsoft_translator_endpoint', 'Microsoft Endpoint', { type: 'url', maxLength: 2000, group: '翻译' }),
      text('mymemory_email', 'MyMemory 邮箱', { type: 'email', maxLength: 320, group: '翻译', help: '可选。匿名额度约 5000 字符/日，填写真实联系邮箱可申请更高额度；实际以服务商限制为准。不会自动使用其他通知邮箱。' }),
      integer('translation_batch_size', '每批翻译条数', { min: 1, max: 50, group: '翻译任务', help: '默认 10 条；同表短字段尽量合并，超过服务限制时自动分段。MyMemory 每次最多 500 字节（包含分隔标记），使用单并发。' }),
      integer('translation_worker_count', '翻译并发数', { min: 1, max: 8, group: '翻译任务' }),
      integer('translation_timeout_seconds', '翻译超时（秒）', { min: 1, max: 120, group: '翻译任务' }),
      textarea('translation_job_state', '翻译任务状态 JSON', { format: 'json', jsonType: 'object', readonly: true, maxLength: 200000, group: '翻译任务' }),
      select('publication_metadata_provider', '论文元数据服务', ['crossref', 'openalex', 'semantic-scholar', 'datacite', 'europe-pmc', 'pubmed'], { group: '元数据' }),
      textarea('publication_metadata_providers', '论文元数据服务 JSON', { format: 'json', jsonType: 'array', maxLength: 10000, group: '元数据', help: '按优先级填写可用来源，例如 ["openalex","crossref","datacite","europe-pmc","pubmed"]；未填写时自动启用全部免费来源。' }),
      select('publication_display_style', '论文引用样式', ['gbt', 'elsevier', 'apa', 'ieee'], { group: '论文' }),
      integer('publication_suggestion_cache_seconds', '论文建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      integer('profile_suggestion_cache_seconds', '人员建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      integer('project_suggestion_cache_seconds', '项目建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      integer('patent_suggestion_cache_seconds', '专利建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      integer('student_suggestion_cache_seconds', '学生建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      integer('news_suggestion_cache_seconds', '动态建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      integer('course_suggestion_cache_seconds', '课程建议缓存秒数', { min: 0, max: 86400, group: '建议缓存' }),
      textarea('patent_metadata_providers', '专利元数据服务 JSON', { format: 'json', jsonType: 'array', maxLength: 10000, group: '元数据' }),
      secret('patentsview_api_key', 'PatentsView API Key', { group: '元数据密钥' }),
      secret('epo_ops_client_id', 'EPO OPS Client ID', { group: '元数据密钥' }),
      secret('epo_ops_client_secret', 'EPO OPS Client Secret', { group: '元数据密钥' }),
      text('notify_email', '系统通知邮箱', { type: 'email', maxLength: 320, group: '通知' })
    ], quick: ['allow_public_registration', 'allow_anonymous_messages'], invalidate: ['module:global_settings', 'public:settings', 'public:home', 'public:media-policy']
  },
  navigation: {
    key: 'navigation', table: 'navigation_items', permission: ['navigation', 'navigation_items'], label: '导航与按钮',
    titleField: 'title', search: ['title', 'title_en', 'path', 'url_name'], filters: ['kind', 'location', 'visibility', 'enabled'],
    list: ['uid', 'title', 'kind', 'location', 'visibility', 'enabled', 'sort_order', 'updated_at'], defaultSort: ['sort_order', 'asc'],
    fields: [
      text('title', '中文文本', { required: true, maxLength: 200, group: '内容' }),
      text('title_en', '英文文本', { maxLength: 200, group: '内容' }),
      select('kind', '类型', [{ value: 'route', label: '站内路由' }, { value: 'external', label: 'HTTPS 外链' }, { value: 'anchor', label: '页面锚点' }, { value: 'button', label: '站内按钮（固定筛选范围）' }], { required: true, default: 'route', group: '链接' }),
      select('url_name', '预设路由', navigationRoutes, { maxLength: 200, group: '链接', visibleWhen: { field: 'kind', in: ['route', 'button'] }, clearWhenHidden: true, help: '预设路由会自动适配中英文路径；与自定义站内路径二选一。' }),
      text('path', '链接路径', { maxLength: 2000, group: '链接', visibleWhen: { field: 'kind', in: ['route', 'external', 'button'] }, requiredWhen: { field: 'kind', in: ['external'] }, clearWhenHidden: true, help: '站内路径以 /开头；外链必须使用不含账号密码的 HTTPS 地址。' }),
      text('fragment', '页面锚点', { maxLength: 64, group: '链接', requiredWhen: { field: 'kind', in: ['anchor'] }, help: '以英文字母开头，可使用字母、数字、下划线和短横线。' }),
      text('icon', '图标', { maxLength: 100, group: '展示' }),
      select('style', '样式', [{ value: 'normal', label: '普通' }, { value: 'primary', label: '主按钮' }, { value: 'secondary', label: '次按钮' }], { default: 'normal', group: '展示' }),
      select('location', '位置', [{ value: 'header', label: '顶部导航' }, { value: 'hero', label: '首页简介下方按钮' }, { value: 'footer', label: '页脚' }, { value: 'admin-sidebar', label: '后台侧边栏' }], { required: true, default: 'header', group: '展示', help: '选择“首页简介下方按钮”可控制首页快捷入口的文字、链接、样式与排序；仅公开且启用的条目显示。后台侧边栏仅能指向有权限访问的 /admin 页面。' }),
      select('visibility', '可见性', [{ value: 'public', label: '公开' }, { value: 'authenticated', label: '已登录' }, { value: 'staff', label: '工作人员' }, { value: 'owner', label: '所有者' }, { value: 'hidden', label: '隐藏' }], { required: true, default: 'public', group: '权限' }),
      boolean('enabled', '启用', { default: 1, group: '状态' }),
      integer('sort_order', '排序', { min: -1000000, max: 1000000, default: 0, group: '状态' })
    ], validation: [
      { type: 'anyRequired', fields: ['url_name', 'path'], when: { field: 'kind', in: ['route', 'button'] }, message: '请选择预设路由或填写站内路径' },
      { type: 'atMostOne', fields: ['url_name', 'path'], when: { field: 'kind', in: ['route', 'button'] }, message: '预设路由和自定义路径只能选择一项' },
      { type: 'allowedValues', field: 'kind', values: ['route', 'button'], when: { field: 'location', in: ['admin-sidebar'] }, message: '后台侧边栏只支持站内路由或站内按钮' },
    ], batch: ['visibility', 'enabled', 'sort_order'], invalidate: ['public:navigation', 'public:layout', 'public:home']
  },
  media: {
    key: 'media', table: 'media_assets', permission: ['media', 'media_assets'], label: '媒体库', readOnlyCreate: true,
    titleField: 'title', search: ['title', 'object_key', 'category', 'mime_type'], filters: ['category', 'mime_type', 'storage_kind', 'status'],
    list: ['uid', 'object_key', 'title', 'category', 'mime_type', 'size', 'storage_kind', 'status', 'updated_at'], defaultSort: ['updated_at', 'desc'],
    fields: [text('title', '标题', { maxLength: 300 }), text('category', '分类', { maxLength: 100 }), select('status', '状态', ['active', 'trash'], { readonly: true })],
    batch: ['category'], invalidate: ['public:media']
  },
  translation: {
    key: 'translation', table: 'translation_cache', permission: ['translation', 'translation_cache'], label: '翻译缓存', readOnlyCreate: true,
    titleField: 'source_ref_key', search: ['source_ref_key', 'source_text', 'translated_text', 'provider'], filters: ['target_lang', 'provider', 'status', 'is_manual', 'is_current'],
    list: ['uid', 'source_ref_key', 'source_text', 'translated_text', 'source_lang', 'target_lang', 'provider', 'status', 'is_manual', 'is_current', 'source_refs', 'error_message', 'updated_at'], defaultSort: ['updated_at', 'desc'],
    fields: [textarea('translated_text', '译文', { readonly: true, maxLength: 500000 }), boolean('is_manual', '人工维护', { readonly: true }), boolean('is_current', '当前有效', { readonly: true })],
    batch: [], invalidate: ['public:translations']
  },
  news: {
    key: 'news', table: 'news', permission: ['news'], label: '新闻动态',
    titleField: 'title', search: ['title','slug','category','content'], filters: ['visibility','is_featured','content_format'],
    list: ['uid','title','slug','category','content_format','published_at','visibility','is_featured','updated_at'], defaultSort: ['updated_at','desc'],
    fields: [
      text('title','标题',{required:true,maxLength:500,group:'基本信息'}), text('slug','Slug',{required:true,maxLength:200,group:'基本信息',help:'仅使用小写字母、数字和单个短横线；服务端会自动转为小写。'}),
      text('category','分类',{maxLength:500,group:'基本信息'}), media('cover_key','封面图',['image/*'],{group:'媒体'}),
      textarea('content','正文',{maxLength:500000,preserveWhitespace:true,group:'正文',visibleWhen:{field:'content_format',in:['plain','markdown']},help:'纯文本或 Markdown 可在此直接编辑；HTML 只能由安全富文本编辑器生成。'}),
      select('content_format','正文格式',[{value:'plain',label:'纯文本'},{value:'markdown',label:'Markdown'},{value:'html',label:'安全富文本',managed:true}],{required:true,default:'plain',group:'正文',help:'选择安全富文本或点击旁边按钮打开设计器；有修改时先保存，新建新闻先保存为非公开草稿。正文格式在设计器保存成功后切换。'}),
      relation('related_publication_uid','关联论文','publications','title',{group:'关联'}),
      relation('related_project_uid','关联项目','projects','name',{group:'关联'}),
      relation('related_student_uid','关联学生','students','name',{group:'关联'}),
      boolean('allow_comments','允许评论或留言入口',{group:'发布'}), datetime('published_at','发布时间',{group:'发布'}),
      select('visibility','可见性',visibility,{required:true,default:'hidden',group:'发布',help:'只有“公开”且已到发布时间的新闻才会出现在前台。'}), boolean('is_featured','精选',{default:0,group:'发布'}), integer('sort_order','排序',{min:-1000000,max:1000000,default:0,group:'发布'})
    ], batch: ['visibility','is_featured','allow_comments','sort_order'], invalidate: ['public:news','public:home','public:translations','public:media']
  }
});

export function getResource(key) {
  const value = RESOURCE_CATALOG[key];
  if (!value) throw new Error('UNKNOWN_ADMIN_RESOURCE');
  return value;
}

export function assertPlainObject(value, code = 'INVALID_OBJECT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(code);
  return value;
}

export function normalizeUid(value) {
  const text = String(value ?? '').normalize('NFC').trim();
  if (!UID_RE.test(text) || CONTROL_RE.test(text)) throw new Error('INVALID_UID');
  return text;
}

export function normalizeObjectKey(value) {
  const text = String(value ?? '').normalize('NFC').trim();
  if (!OBJECT_KEY_RE.test(text) || text.includes('//') || text.startsWith('.')) throw new Error('INVALID_OBJECT_KEY');
  return text;
}

export function normalizeUploadExtensions(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw new Error('INVALID_UPLOAD_EXTENSIONS'); }
  }
  if (!Array.isArray(parsed) || parsed.length > SUPPORTED_UPLOAD_EXTENSIONS.length) throw new Error('INVALID_UPLOAD_EXTENSIONS');
  const normalized = [];
  for (const item of parsed) {
    if (typeof item !== 'string') throw new Error('INVALID_UPLOAD_EXTENSIONS');
    const extension = item.normalize('NFKC').trim().toLowerCase().replace(/^\./u, '');
    if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) throw new Error('INVALID_UPLOAD_EXTENSIONS');
    if (!normalized.includes(extension)) normalized.push(extension);
  }
  return normalized;
}

export function normalizePage(value) {
  const n = Number(value ?? 1);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000) throw new Error('INVALID_PAGE');
  return n;
}

export function normalizePageSize(value) {
  const n = Number(value ?? 20);
  if (!PAGE_SIZES.includes(n)) throw new Error('INVALID_PAGE_SIZE');
  return n;
}

export function normalizeSearch(value) {
  const text = String(value ?? '').normalize('NFC').trim();
  if (text.length > 200 || CONTROL_RE.test(text)) throw new Error('INVALID_SEARCH');
  return text;
}

export function normalizeDirection(value) {
  const v = String(value ?? 'asc').toLowerCase();
  if (v !== 'asc' && v !== 'desc') throw new Error('INVALID_SORT_DIRECTION');
  return v;
}

export function normalizeFieldValue(field, value, mode = 'create') {
  if (field.readonly) throw new Error(`READ_ONLY_FIELD:${field.key}`);
  if (mode === 'update' && field.immutableOnUpdate) throw new Error(`IMMUTABLE_FIELD:${field.key}`);
  if (value === null || value === undefined || value === '') {
    if (field.required) throw new Error(`REQUIRED_FIELD:${field.key}`);
    return null;
  }
  switch (field.type) {
    case 'boolean': {
      if (value === true || value === 1 || value === '1') return 1;
      if (value === false || value === 0 || value === '0') return 0;
      throw new Error(`INVALID_BOOLEAN:${field.key}`);
    }
    case 'integer': {
      const raw = typeof value === 'number' ? String(value) : String(value).trim();
      if (!INTEGER_RE.test(raw)) throw new Error(`INVALID_INTEGER:${field.key}`);
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || (field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) throw new Error(`INVALID_INTEGER:${field.key}`);
      return n;
    }
    case 'decimal': {
      const raw = String(value).trim();
      if (!DECIMAL_RE.test(raw)) throw new Error(`INVALID_DECIMAL:${field.key}`);
      return raw;
    }
    case 'date': {
      const raw = String(value).trim();
      if (!ISO_DATE_RE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) throw new Error(`INVALID_DATE:${field.key}`);
      return raw;
    }
    case 'datetime': {
      const raw = String(value).trim();
      if (!ISO_DATETIME_RE.test(raw) || Number.isNaN(Date.parse(raw))) throw new Error(`INVALID_DATETIME:${field.key}`);
      return new Date(raw).toISOString();
    }
    case 'email': {
      const raw = String(value).normalize('NFC').trim().toLowerCase();
      if (raw.length > (field.maxLength ?? 320) || !EMAIL_RE.test(raw)) throw new Error(`INVALID_EMAIL:${field.key}`);
      return raw;
    }
    case 'url': {
      const raw = String(value).trim();
      let parsed;
      try { parsed = new URL(raw); } catch { throw new Error(`INVALID_URL:${field.key}`); }
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`INVALID_URL:${field.key}`);
      return parsed.toString();
    }
    case 'media': return normalizeObjectKey(value);
    case 'select': {
      const raw = String(value).normalize('NFC').trim();
      if (!field.options.some(option => String(option.value) === raw)) throw new Error(`INVALID_OPTION:${field.key}`);
      return raw;
    }
    default: {
      let raw = String(value).normalize('NFC');
      if (!field.preserveWhitespace) raw = raw.trim();
      if (CONTROL_RE.test(raw.replace(/[\n\r\t]/gu, ''))) throw new Error(`INVALID_TEXT:${field.key}`);
      if (raw.length > (field.maxLength ?? 500)) throw new Error(`TEXT_TOO_LONG:${field.key}`);
      if (field.format === 'json') {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { throw new Error(`INVALID_JSON:${field.key}`); }
        if (parsed === undefined) throw new Error(`INVALID_JSON:${field.key}`);
        if (field.jsonType === 'array' && !Array.isArray(parsed)) throw new Error(`INVALID_JSON_ARRAY:${field.key}`);
        if (field.jsonType === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error(`INVALID_JSON_OBJECT:${field.key}`);
        raw = JSON.stringify(parsed);
      }
      return raw;
    }
  }
}

export function normalizeRecordInput(resourceKey, body, mode = 'create') {
  const resource = getResource(resourceKey);
  const source = assertPlainObject(body, 'INVALID_RECORD_BODY');
  const fieldMap = new Map(resource.fields.map(field => [field.key, field]));
  const values = {};
  const secretOperations = {};
  const allowedMeta = new Set(['expectedUpdatedAt', 'secretOperations', 'password', 'confirmPassword']);
  for (const [key, value] of Object.entries(source)) {
    if (allowedMeta.has(key)) continue;
    const field = fieldMap.get(key);
    if (!field) throw new Error(`UNKNOWN_FIELD:${key}`);
    if (field.secret) throw new Error(`SECRET_REQUIRES_OPERATION:${key}`);
    values[key] = normalizeFieldValue(field, value, mode);
  }
  if (mode === 'create') {
    for (const field of resource.fields) {
      if (field.required && !field.secret && !(field.key in values)) throw new Error(`REQUIRED_FIELD:${field.key}`);
    }
  }
  if (source.secretOperations !== undefined) {
    const operations = assertPlainObject(source.secretOperations, 'INVALID_SECRET_OPERATIONS');
    for (const [key, raw] of Object.entries(operations)) {
      const field = fieldMap.get(key);
      if (!field?.secret) throw new Error(`UNKNOWN_SECRET_FIELD:${key}`);
      const operation = assertPlainObject(raw, `INVALID_SECRET_OPERATION:${key}`);
      const action = String(operation.action ?? '');
      if (!['keep', 'replace', 'clear'].includes(action)) throw new Error(`INVALID_SECRET_ACTION:${key}`);
      if (action === 'replace') {
        const next = String(operation.value ?? '').normalize('NFC').trim();
        if (!next || next.length > (field.maxLength ?? 4096) || CONTROL_RE.test(next)) throw new Error(`INVALID_SECRET_VALUE:${key}`);
        secretOperations[key] = { action, value: next };
      } else {
        if ('value' in operation && operation.value !== '' && operation.value !== null && operation.value !== undefined) throw new Error(`UNEXPECTED_SECRET_VALUE:${key}`);
        secretOperations[key] = { action };
      }
    }
  }
  return { values, secretOperations };
}

export function validateNavigation(values) {
  const kind = values.kind == null ? '' : String(values.kind).trim();
  const urlName = values.url_name == null ? '' : String(values.url_name).trim();
  const path = values.path == null ? '' : String(values.path).trim();
  const fragment = values.fragment == null ? '' : String(values.fragment).trim();
  const location = values.location == null ? '' : String(values.location).trim();
  if (!['route', 'external', 'anchor', 'button'].includes(kind)) throw new Error('INVALID_NAVIGATION_KIND:kind');
  if (fragment && !SAFE_ANCHOR_RE.test(fragment)) throw new Error('INVALID_FRAGMENT:fragment');
  if (urlName && !navigationRoutes.some(option => option.value === urlName)) throw new Error('INVALID_ROUTE_NAME:url_name');
  if ((kind === 'route' || kind === 'button') && !urlName && !path) throw new Error('REQUIRED_NAVIGATION_TARGET:path');
  if ((kind === 'route' || kind === 'button') && urlName && path) throw new Error('INVALID_NAVIGATION_TARGET:path');
  if (kind === 'external' && urlName) throw new Error('INVALID_NAVIGATION_FIELD:url_name');
  if (kind === 'anchor' && (urlName || path)) throw new Error(`INVALID_NAVIGATION_FIELD:${urlName ? 'url_name' : 'path'}`);
  if (kind === 'anchor' && !fragment) throw new Error('REQUIRED_NAVIGATION_FRAGMENT:fragment');
  if (kind === 'external') {
    if (!path) throw new Error('REQUIRED_NAVIGATION_TARGET:path');
    let url;
    try { url = new URL(path); } catch { throw new Error('INVALID_EXTERNAL_URL:path'); }
    if (url.protocol !== 'https:' || url.username || url.password || CONTROL_RE.test(url.toString()) || path.includes('\\')) throw new Error('INVALID_EXTERNAL_URL:path');
  } else if (path) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || CONTROL_RE.test(path) || /(?:^|\/)\.\.(?:\/|$)/u.test(path)) throw new Error('INVALID_INTERNAL_PATH:path');
    for (const segment of path.split(/[?#]/u, 1)[0].split('/')) {
      let decoded;
      try { decoded = decodeURIComponent(segment); } catch { throw new Error('INVALID_INTERNAL_PATH:path'); }
      if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || CONTROL_RE.test(decoded)) throw new Error('INVALID_INTERNAL_PATH:path');
    }
    let parsed;
    try { parsed = new URL(path, 'https://navigation.invalid'); } catch { throw new Error('INVALID_INTERNAL_PATH:path'); }
    if (parsed.origin !== 'https://navigation.invalid') throw new Error('INVALID_INTERNAL_PATH:path');
    for (const segment of parsed.pathname.split('/')) {
      let decoded;
      try { decoded = decodeURIComponent(segment); } catch { throw new Error('INVALID_INTERNAL_PATH:path'); }
      if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || CONTROL_RE.test(decoded)) throw new Error('INVALID_INTERNAL_PATH:path');
    }
    const lowered = parsed.pathname.toLowerCase();
    if (['/api', '/_nuxt', '/media', '/__cms_cache'].some(prefix => lowered === prefix || lowered.startsWith(`${prefix}/`))) throw new Error('FORBIDDEN_INTERNAL_PATH:path');
  }
  if (location === 'admin-sidebar') {
    if (!['route', 'button'].includes(kind)) throw new Error('INVALID_NAVIGATION_KIND:kind');
    const adminTarget = urlName === 'admin' || urlName === 'login' ? '/admin' : path;
    if (!adminTarget || (adminTarget !== '/admin' && !adminTarget.startsWith('/admin/'))) throw new Error('INVALID_ADMIN_NAVIGATION_TARGET:path');
  }
  return values;
}

export function detectMediaSignature(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('INVALID_MEDIA_BYTES');
  const b = bytes;
  const starts = values => values.every((value, index) => b[index] === value);
  if (b.length >= 8 && starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return { mime: 'image/png', extension: 'png' };
  if (b.length >= 3 && starts([0xff,0xd8,0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (b.length >= 6 && String.fromCharCode(...b.slice(0,6)).match(/^GIF8[79]a$/u)) return { mime: 'image/gif', extension: 'gif' };
  if (b.length >= 12 && String.fromCharCode(...b.slice(0,4)) === 'RIFF' && String.fromCharCode(...b.slice(8,12)) === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  if (b.length >= 12 && String.fromCharCode(...b.slice(4,8)) === 'ftyp') return { mime: 'video/mp4', extension: 'mp4' };
  if (b.length >= 16 && starts([0x1a,0x45,0xdf,0xa3]) && String.fromCharCode(...b).toLowerCase().includes('webm')) return { mime: 'video/webm', extension: 'webm' };
  if (b.length >= 5 && String.fromCharCode(...b.slice(0,5)) === '%PDF-') return { mime: 'application/pdf', extension: 'pdf' };
  if (b.length >= 4 && starts([0x50,0x4b,0x03,0x04])) return { mime: 'application/zip', extension: 'zip' };
  return null;
}


export function detectImageDimensions(bytes, mime) {
  if (!(bytes instanceof Uint8Array)) throw new Error('INVALID_MEDIA_BYTES');
  const be16 = offset => (bytes[offset] << 8) | bytes[offset + 1];
  const be32 = offset => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  const le16 = offset => bytes[offset] | (bytes[offset + 1] << 8);
  let width = 0, height = 0;
  if (mime === 'image/png' && bytes.length >= 24) { width = be32(16); height = be32(20); }
  else if (mime === 'image/gif' && bytes.length >= 10) { width = le16(6); height = le16(8); }
  else if (mime === 'image/webp' && bytes.length >= 30 && String.fromCharCode(...bytes.slice(12,16)) === 'VP8X') {
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  } else if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]; offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = be16(offset); if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { height = be16(offset + 3); width = be16(offset + 5); break; }
      offset += length;
    }
  }
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null;
  return { width, height, pixels: width * height };
}

const ALLOWED_RICH_NODES = new Set(['doc','paragraph','heading','text','blockquote','bulletList','orderedList','listItem','codeBlock','hardBreak','horizontalRule','image','pdf']);
const ALLOWED_MARKS = new Set(['bold','italic','underline','strike','code','link']);
function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

export function validateRichTextDocument(input) {
  const root = assertPlainObject(input, 'INVALID_RICH_TEXT');
  let nodes = 0;
  let textLength = 0;
  const walk = (node, depth = 0) => {
    if (depth > 32) throw new Error('RICH_TEXT_TOO_DEEP');
    assertPlainObject(node, 'INVALID_RICH_TEXT_NODE');
    if (!ALLOWED_RICH_NODES.has(node.type)) throw new Error(`UNSUPPORTED_RICH_TEXT_NODE:${node.type}`);
    nodes += 1;
    if (nodes > MAX_RICH_TEXT_NODES) throw new Error('RICH_TEXT_TOO_MANY_NODES');
    const normalized = { type: node.type };
    if (node.type === 'text') {
      const value = String(node.text ?? '').normalize('NFC');
      textLength += value.length;
      if (textLength > MAX_RICH_TEXT_TEXT || CONTROL_RE.test(value.replace(/[\n\r\t]/gu,''))) throw new Error('INVALID_RICH_TEXT_TEXT');
      normalized.text = value;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length > 16) throw new Error('INVALID_RICH_TEXT_MARKS');
        normalized.marks = node.marks.map(mark => {
          assertPlainObject(mark, 'INVALID_RICH_TEXT_MARK');
          if (!ALLOWED_MARKS.has(mark.type)) throw new Error(`UNSUPPORTED_RICH_TEXT_MARK:${mark.type}`);
          if (mark.type === 'link') {
            let url;
            try { url = new URL(String(mark.attrs?.href ?? '')); } catch { throw new Error('INVALID_RICH_TEXT_LINK'); }
            if (!['https:','http:','mailto:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_RICH_TEXT_LINK');
            return { type: 'link', attrs: { href: url.toString() } };
          }
          return { type: mark.type };
        });
      }
    }
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 2);
      if (!Number.isInteger(level) || level < 2 || level > 4) throw new Error('INVALID_HEADING_LEVEL');
      const textAlign = node.attrs?.textAlign == null ? 'left' : String(node.attrs.textAlign);
      if (!['left','center','right','justify'].includes(textAlign)) throw new Error('INVALID_TEXT_ALIGNMENT');
      normalized.attrs = { level, textAlign };
    }
    if (node.type === 'paragraph') {
      const textAlign = node.attrs?.textAlign == null ? 'left' : String(node.attrs.textAlign);
      if (!['left','center','right','justify'].includes(textAlign)) throw new Error('INVALID_TEXT_ALIGNMENT');
      normalized.attrs = { textAlign };
    }
    if (node.type === 'pdf') {
      const key = normalizeObjectKey(node.attrs?.objectKey);
      const title = String(node.attrs?.title ?? '').normalize('NFC').trim();
      if (title.length > 500 || CONTROL_RE.test(title)) throw new Error('INVALID_PDF_TITLE');
      normalized.attrs = { objectKey: key, title };
    }
    if (node.type === 'image') {
      const key = normalizeObjectKey(node.attrs?.objectKey);
      const alt = String(node.attrs?.alt ?? '').normalize('NFC').trim();
      if (alt.length > 500 || CONTROL_RE.test(alt)) throw new Error('INVALID_IMAGE_ALT');
      const float = node.attrs?.float == null ? 'none' : String(node.attrs.float);
      if (!['none','left','right','center','wide'].includes(float)) throw new Error('INVALID_IMAGE_FLOAT');
      normalized.attrs = { objectKey: key, alt, float };
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw new Error('INVALID_RICH_TEXT_CONTENT');
      normalized.content = node.content.map(child => walk(child, depth + 1));
    }
    return normalized;
  };
  const result = walk(root);
  if (result.type !== 'doc') throw new Error('RICH_TEXT_ROOT_REQUIRED');
  return result;
}

function renderText(node) {
  let value = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') value = `<strong>${value}</strong>`;
    else if (mark.type === 'italic') value = `<em>${value}</em>`;
    else if (mark.type === 'underline') value = `<u>${value}</u>`;
    else if (mark.type === 'strike') value = `<s>${value}</s>`;
    else if (mark.type === 'code') value = `<code>${value}</code>`;
    else if (mark.type === 'link') value = `<a href="${escapeHtml(mark.attrs.href)}" rel="noopener noreferrer nofollow">${value}</a>`;
  }
  return value;
}
export function renderRichTextDocument(input, mediaUrl = key => `/media/${key.split('/').map(encodeURIComponent).join('/')}`) {
  const doc = validateRichTextDocument(input);
  const render = node => {
    const children = (node.content ?? []).map(render).join('');
    const alignClass = node.attrs?.textAlign && node.attrs.textAlign !== 'left' ? ` class="rich-align-${node.attrs.textAlign}"` : '';
    switch (node.type) {
      case 'doc': return children;
      case 'text': return renderText(node);
      case 'paragraph': return `<p${alignClass}>${children}</p>`;
      case 'heading': return `<h${node.attrs.level}${alignClass}>${children}</h${node.attrs.level}>`;
      case 'blockquote': return `<blockquote>${children}</blockquote>`;
      case 'bulletList': return `<ul>${children}</ul>`;
      case 'orderedList': return `<ol>${children}</ol>`;
      case 'listItem': return `<li>${children}</li>`;
      case 'codeBlock': return `<pre><code>${children}</code></pre>`;
      case 'hardBreak': return '<br>';
      case 'horizontalRule': return '<hr>';
      case 'pdf': return `<figure data-type="pdf" data-object-key="${escapeHtml(node.attrs.objectKey)}" data-title="${escapeHtml(node.attrs.title)}"></figure>`;
      case 'image': return `<figure class="rich-image-${node.attrs.float}"><img src="${escapeHtml(mediaUrl(node.attrs.objectKey))}" data-object-key="${escapeHtml(node.attrs.objectKey)}" alt="${escapeHtml(node.attrs.alt)}" loading="lazy" decoding="async"></figure>`;
      default: throw new Error('UNREACHABLE_RICH_TEXT_NODE');
    }
  };
  return render(doc);
}

export function richTextMediaKeys(input) {
  const doc = validateRichTextDocument(input);
  const keys = new Set();
  const walk = node => {
    if (node.type === 'image' || node.type === 'pdf') keys.add(node.attrs.objectKey);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  if (keys.size > 200) throw new Error('RICH_TEXT_TOO_MANY_MEDIA');
  return [...keys];
}

export function normalizeBatchRequest(resourceKey, input) {
  const resource = getResource(resourceKey);
  const body = assertPlainObject(input, 'INVALID_BATCH_BODY');
  if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > MAX_BATCH) throw new Error('INVALID_BATCH_RECORDS');
  const field = String(body.field ?? '');
  if (!resource.batch?.includes(field)) throw new Error('BATCH_FIELD_NOT_ALLOWED');
  const descriptor = resource.fields.find(entry => entry.key === field);
  if (!descriptor) throw new Error('BATCH_FIELD_NOT_FOUND');
  const seen = new Set();
  const records = body.records.map(raw => {
    const item = assertPlainObject(raw, 'INVALID_BATCH_RECORD');
    const uid = normalizeUid(item.uid);
    if (seen.has(uid)) throw new Error('DUPLICATE_BATCH_UID');
    seen.add(uid);
    const expectedUpdatedAt = String(item.expectedUpdatedAt ?? '').trim();
    if (!ISO_DATETIME_RE.test(expectedUpdatedAt) || Number.isNaN(Date.parse(expectedUpdatedAt))) throw new Error('INVALID_EXPECTED_UPDATED_AT');
    return { uid, expectedUpdatedAt: new Date(expectedUpdatedAt).toISOString() };
  });
  if (body.sequence !== undefined) {
    if (descriptor.type !== 'integer') throw new Error('BATCH_SEQUENCE_NOT_ALLOWED');
    const sequence = assertPlainObject(body.sequence, 'INVALID_BATCH_SEQUENCE');
    const requiredDescriptor = { ...descriptor, required: true };
    const start = normalizeFieldValue(requiredDescriptor, sequence.start, 'update');
    const step = normalizeFieldValue({ key: field, type: 'integer', required: true, min: -1000000, max: 1000000 }, sequence.step, 'update');
    if (step === 0) throw new Error('INVALID_BATCH_SEQUENCE_STEP');
    const values = records.map((_, index) => {
      const value = start + (index * step);
      if (!Number.isSafeInteger(value) || (descriptor.min !== undefined && value < descriptor.min) || (descriptor.max !== undefined && value > descriptor.max)) throw new Error(`INVALID_INTEGER:${field}`);
      return value;
    });
    return { field, value: null, values, records, sequence: { start, step } };
  }
  const value = normalizeFieldValue(descriptor, body.value, 'update');
  return { field, value, values: null, records, sequence: null };
}

export function createBackupEnvelope(tables, options = {}) {
  assertPlainObject(tables, 'INVALID_BACKUP_TABLES');
  const createdAt = new Date(options.createdAt ?? Date.now()).toISOString();
  const normalized = {};
  let rows = 0;
  for (const [table, records] of Object.entries(tables)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(table) || !Array.isArray(records)) throw new Error('INVALID_BACKUP_TABLE');
    normalized[table] = records.map(record => ({ ...assertPlainObject(record, 'INVALID_BACKUP_RECORD') }));
    rows += records.length;
    if (rows > MAX_EXPORT_ROWS) throw new Error('BACKUP_ROW_LIMIT');
  }
  const envelope = { format: 'academic-cms-backup', version: 1, createdAt, schemaVersion: String(options.schemaVersion ?? 'unknown'), tables: normalized };
  const serialized = JSON.stringify(envelope);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) throw new Error('BACKUP_SIZE_LIMIT');
  return envelope;
}

export function parseBackupEnvelope(input) {
  const envelope = assertPlainObject(input, 'INVALID_BACKUP');
  if (envelope.format !== 'academic-cms-backup' || envelope.version !== 1) throw new Error('UNSUPPORTED_BACKUP');
  const tables = assertPlainObject(envelope.tables, 'INVALID_BACKUP_TABLES');
  return createBackupEnvelope(tables, { createdAt: envelope.createdAt, schemaVersion: envelope.schemaVersion });
}

export function redactSensitive(value) {
  const sensitive = /(?:password|secret|token|authorization|cookie|api[_-]?key|client[_-]?secret|csrf)/iu;
  const walk = (input, depth = 0) => {
    if (depth > 12) return '[REDACTED_DEPTH]';
    if (Array.isArray(input)) return input.slice(0, 1000).map(item => walk(item, depth + 1));
    if (!input || typeof input !== 'object') return input;
    const output = {};
    for (const [key, item] of Object.entries(input)) output[key] = sensitive.test(key) ? '[REDACTED]' : walk(item, depth + 1);
    return output;
  };
  return walk(value);
}

export function buildTranslationProviderRequest(provider, config, texts, sourceLang = 'zh', targetLang = 'en') {
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > 100 || texts.some(text => typeof text !== 'string' || text.length > 20_000)) throw new Error('INVALID_TRANSLATION_BATCH');
  const p = String(provider);
  const c = assertPlainObject(config, 'INVALID_PROVIDER_CONFIG');
  if (p === 'libretranslate') {
    const endpoint = new URL(String(c.url).trim());
    endpoint.pathname = endpoint.pathname.replace(/\/+$/u, '');
    if (!endpoint.pathname.endsWith('/translate')) endpoint.pathname += '/translate';
    if (endpoint.protocol !== 'https:' && endpoint.hostname !== '127.0.0.1' && endpoint.hostname !== 'localhost') throw new Error('INSECURE_PROVIDER_ENDPOINT');
    return { url: endpoint.toString(), method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: texts, source: sourceLang, target: targetLang, format: 'text', api_key: c.apiKey || undefined }) };
  }
  if (p === 'deepl') return { url: `${String(c.apiKey ?? '').trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'}/v2/translate`, method: 'POST', headers: { authorization: `DeepL-Auth-Key ${String(c.apiKey ?? '').trim()}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: texts, source_lang: sourceLang.toUpperCase(), target_lang: targetLang.toUpperCase() }) };
  if (p === 'google') return { url: `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(String(c.apiKey ?? ''))}`, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: texts, source: sourceLang, target: targetLang, format: 'text' }) };
  if (p === 'microsoft') return { url: `${String(c.endpoint || 'https://api.cognitive.microsofttranslator.com').replace(/\/$/u,'')}/translate?api-version=3.0&from=${encodeURIComponent(sourceLang)}&to=${encodeURIComponent(targetLang)}`, method: 'POST', headers: { 'content-type': 'application/json', 'ocp-apim-subscription-key': String(c.apiKey ?? ''), 'ocp-apim-subscription-region': String(c.region ?? '') }, body: JSON.stringify(texts.map(Text => ({ Text }))) };
  if (p === 'mymemory') {
    if (texts.length !== 1) throw new Error('MYMEMORY_SINGLE_TEXT_ONLY');
    if (new TextEncoder().encode(texts[0]).byteLength > 500) throw new Error('PROVIDER_TEXT_TOO_LARGE');
    const query = new URLSearchParams({ q: texts[0], langpair: `${sourceLang === 'zh' ? 'zh-CN' : sourceLang}|${targetLang}` });
    const email = String(c.email ?? '').trim();
    if (email) query.set('de', email);
    return { url: `https://api.mymemory.translated.net/get?${query.toString()}`, method: 'GET', headers: {}, body: undefined };
  }
  throw new Error('UNKNOWN_TRANSLATION_PROVIDER');
}

/** Validate the requested media kind independently of editor-supplied file names. */
export function richTextMediaReferences(input) {
  const doc = validateRichTextDocument(input);
  const refs = new Map();
  const walk = node => {
    if (node.type === 'image' || node.type === 'pdf') refs.set(`${node.type}:${node.attrs.objectKey}`, { objectKey: node.attrs.objectKey, kind: node.type });
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  if (refs.size > 200) throw new Error('RICH_TEXT_TOO_MANY_MEDIA');
  return [...refs.values()];
}
