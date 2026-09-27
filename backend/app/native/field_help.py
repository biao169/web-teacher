"""Administrator field meanings and requirements derived from the real native validators."""
import json
from .catalog import TABLES,label

COMMON={
 'name':'用于列表名称和详情标题。','name_en':'英文名称；英文页面有值时优先使用，留空回退原名称。',
 'title':'用于列表和详情的标题。','email':'联系邮箱；例如 name@example.org，不会自动发送邮件。',
 'phone':'联系电话，可保留国家区号和分机说明。','office':'填写办公地点，例如某楼301室。',
 'organization':'填写所属学校或单位。','lab':'记录实验室或团队名称；当前访客页面未单独展示。',
 'bio':'填写介绍正文，可分段换行。','bio_en':'英文简介；英文页面优先使用，留空回退原简介。',
 'education':'自由编排教育经历，例如“2010—2014 某大学 本科”；换行保留，不强制拆分日期。',
 'experience':'自由编排工作或科研经历，例如“2018年至今 某大学 教师”；可自行填写时间。',
 'recruiting':'教师详情中的招生要求、研究兴趣和联系方式说明。',
 'personal_homepage':'个人网站完整链接，例如 https://example.org。',
 'homepage':'个人主页完整链接；当前学生访客页面未单独展示此链接。',
 'google_scholar':'Google Scholar学术主页链接。','dblp':'DBLP作者主页链接。','github':'GitHub个人或团队主页链接。','cnki':'知网作者主页链接。',
 'orcid':'ORCID链接或编号；例如0000-0000-0000-000X。当前访客链接展示需使用完整地址。',
 'sort_order':'默认按数字从小到大排序；列表显式选择其他排序时按所选字段排序。',
 'display_order':'数字较小的分类优先排列。',
 'visibility':'控制记录的访问范围；首页精选不会自动公开内容。',
 'is_featured':'用于首页精选筛选；只有符合公开条件的内容才能展示。',
 'contact_visibility':'单独控制联系方式；当前访客页仅显示设为公开的联系方式。',
 'avatar_key':'教师或学生头像；选择/上传可检索全部适用图片，预览完整等比显示。',
 'pdf_key':'论文PDF附件；通过统一媒体库选择或上传PDF。',
 'pdf_visibility':'控制论文PDF访问范围，与论文正文可见性分别校验。',
 'cover_key':'新闻封面图片；选择或上传后可裁剪另存，保存整条新闻后建立引用。',
 'material_visibility':'独立控制课程材料的引用权限；当前访客模板未展示材料下载按钮。',
 'url':'完整HTTP/HTTPS链接，不可包含账号和密码；当前论文访客页主要提供DOI链接。',
 'keywords':'用于关键词记录及适用的检索条件。','category':'用于分类及筛选，可填写中文。',
 'status':'记录当前业务状态，用于列表查看及筛选。','description':'填写说明内容，可保留换行。',
 'summary':'记录补充说明；是否公开展示取决于对应模块。',
 'start_date':'项目开始日期。','end_date':'项目结束日期；未确定时可留空。',
}

BY_TABLE={
 'profiles':{
  'role':'记录教师、负责人或团队成员等角色；不授予后台账号权限。','title':'用于教师卡片显示职称或头衔，例如教授。',
  'is_active':'开启且内容公开时允许访客访问此成员；关闭不会删除资料。',
  'is_featured':'记录精选标记，并供引文高亮姓名选择使用；当前首页教师区并不单独按此开关筛选。',
 },
 'students':{
  'student_id':'内部学号；不会发送到访客页面。','degree':'填写培养层次，例如博士、硕士；可参与分类关键词匹配。',
  'category':'学生原始分类；分类规则匹配不会改写此值。','grade':'填写年级，例如2026级；可参与分类匹配。',
  'direction':'研究方向说明；可参与分类关键词匹配。','status':'填写在读、毕业等状态；可参与分类匹配。',
  'enrollment_date':'记录入学日期；当前访客模板未单独展示。','graduation_date':'记录毕业日期；未毕业时可留空，当前访客模板未单独展示。',
  'destination':'记录毕业单位、升学学校等去向；当前访客模板未单独展示。','awards':'记录获奖情况；当前访客模板未单独展示。',
 },
 'student_category_displays':{
  'key':'分类规则的内部唯一标识；例如 doctoral，不能与已有分类重复。','label':'后台分类规则的中文名称。',
  'label_en':'保存分类的英文名称；当前访客分类分组尚未接入。',
  'keywords':'任意词命中培养层次、分类、年级、研究方向或状态即可；分号、逗号或换行分隔，最多20词、每词120字。',
  'enabled':'保存规则启用状态；预览不会启用，点击“保存并激活匹配”会保存整条记录并开启。',
 },
 'projects':{
  'source':'显示项目来源，例如国家自然科学基金。','fund_name':'记录具体基金或计划名称，用于检索及筛选。','project_number':'项目立项编号；详情中显示。',
  'project_role':'记录主持、参与等承担角色。','principal':'项目负责人；详情中显示。','members':'项目成员姓名；详情中显示。',
  'amount':'项目经费，单位万元；非负数、最多4位小数。当前访客模板未展示金额。','summary':'内部项目说明，不发送到访客页面。',
 },
 'publications':{
  'title':'填写论文原题名，不拆中英文；需要英文展示时使用翻译功能。',
  'source_citation':'粘贴完整原始引文并点击解析；解析上限20000字符，保存原文不会自动回填。',
  'authors':'按论文作者顺序填写；作者与期刊、年份等共同用于生成引文。',
  'venue':'期刊或会议名称，用于列表、详情和自动引文。','year':'论文发表年份，用于检索、筛选及引文。',
  'volume':'期刊卷号，可保留字母；用于引文生成。','issue':'期刊期号，可保留增刊标记；用于引文生成。','pages':'页码范围或文章号，例如123–135或e102345；用于引文生成。',
  'doi':'填写论文DOI；联网辅助支持DOI或doi.org链接，入库建议使用10.xxxx/xxx编号。',
  'publication_type':'记录期刊、会议等论文类型。','author_role':'记录第一作者、通讯作者等角色。','corresponding_authors':'记录通讯作者姓名。',
  'index_type':'记录SCI、EI等收录类型；不会自动检索或核验收录情况。','display_tags':'保存用于内容分类的展示标签；当前访客模板未展示标签。',
 },
 'patents':{
  'country':'专利申请国家或地区，例如中国。','patent_type':'记录发明、实用新型、软件著作权等类型。',
  'application_number':'申请号或软件登记申请编号。','grant_number':'授权号或软件著作权登记号。','application_date':'记录申请日期。','grant_date':'记录授权或登记日期。',
  'inventors':'按顺序填写发明人或软件作者。','owner':'记录专利权人或著作权人；不代表后台所有者权限。',
  'legal_status':'记录申请中、已授权、失效等法律状态；不会自动查询更新。','summary':'记录补充说明；当前访客模板未单独展示。',
  'certificate_key':'证书图片或PDF；适用类型由统一媒体选择器限制，当前访客模板未展示下载入口。',
 },
 'courses':{
  'semester':'开课学期，例如2026年秋季。','audience':'授课对象，例如本科三年级。','summary':'课程介绍，显示在访客课程卡片。',
  'syllabus_key':'选择教学大纲附件；当前访客模板未展示下载入口。','material_key':'选择课程材料附件；当前访客模板未展示下载入口。',
  'references_text':'参考教材、文献和学习资料，显示在课程详情中。',
 },
 'news':{
  'slug':'保存新闻短标识；当前访客详情地址仍使用记录UID。','category':'记录新闻分类，供后台检索和筛选使用。',
  'content':'新闻正文；HTML模式可通过统一媒体工具插入图片/PDF，保存时清理不安全内容。',
  'content_format':'选择纯文本、Markdown或可视富文本；预览与新闻详情共用渲染。切换格式需转换，复杂排版可能损失；保存前可恢复转换前草稿。',
  'related_publication_uid':'关联一篇已有且有权查看的论文；当前访客模板未单独展示关联入口。',
  'related_project_uid':'关联一个已有且有权查看的项目；当前访客模板未单独展示关联入口。',
  'related_student_uid':'关联一名已有且有权查看的学生；当前访客模板未单独展示关联入口。',
  'allow_comments':'当前仅保存，新闻详情评论入口尚未接入；通用联系页面仍由全局留言设置控制。',
  'published_at':'访客仅能查看已到发布时间且公开的新闻；留空不发布，未来时间到达后才可见。',
 },
 'navigation_items':{
  'title':'用于前台或后台入口的显示文本；启用及可见范围决定是否显示。',
  'title_en':'保存英文入口文本；当前访客与后台导航仍统一显示中文文本。',
  'kind':'选择入口类型；选项下方会说明当前支持状态。','location':'选择展示位置；尚未独立接入的位置会说明实际落点。',
  'url_name':'后台入口唯一标识：1–80个小写字母、数字、下划线或短横线，首字符须为字母或数字；不填写中文。',
  'path':'填写完整站内路径或HTTP/HTTPS地址；后台侧栏仅接受内容模块及固定条件，使用上方工具可自动生成。',
  'fragment':'锚点名，例如main，不含#；工具可将它应用到站内路径，单独保存此字段不会改变跳转。',
  'icon':'使用现有开源图标；后台侧栏实际显示，当前前台暂未使用此配置。','style':'选择后台侧栏的普通、强调或描边样式。',
  'visibility':'后台入口与账号的可见范围及目标权限共同校验；前台入口必须公开且启用。',
  'enabled':'关闭后隐藏入口；不会删除内容，也不会授予或撤销目标模块权限。',
 },
 'site_settings':{
  'is_active':'选择生效配置；存在多条启用设置时，当前使用最早创建的一条。',
  'site_name':'中文站点名称，用于访客顶部及后台品牌名称。','site_name_en':'英文站点名称；英文页面留空时使用中文名称。',
  'hero_title':'首页主标题，留空时使用站点名称。','hero_subtitle':'首页副标题，留空时使用默认科研教学说明。',
  'logo_key':'登记网站Logo图片；当前访客模板未显示此设置。','favicon_key':'登记浏览器图标图片；当前模板尚未接入此设置。',
  'og_image_key':'登记社交分享图片；当前模板尚未输出对应分享元信息。','seo_title':'当前仅保存，尚未接入页面SEO标题。',
  'seo_description':'当前仅保存，尚未接入页面描述元信息。','seo_keywords':'当前仅保存，尚未接入关键词元信息。',
  'footer_text':'前台页脚文本；当前按纯文本显示，HTML标签不会执行。',
  'homepage_publication_limit':'首页论文总展示数量；0隐藏，首批最多10条，其余滚动分批加载。',
  'homepage_project_limit':'首页项目总展示数量；默认10，0隐藏，其余滚动分批加载。',
  'homepage_news_limit':'首页动态总展示数量；0隐藏，首批最多10条，其余滚动分批加载。',
 },
 'global_settings':{
  'allow_public_registration':'允许访客打开公开注册入口；注册仍需通过现有账号校验。','allow_anonymous_messages':'允许未登录访客提交联系留言；关闭时需先登录。',
  'upload_max_size_mb':'媒体单文件大小配置，按1024²字节计算；当前实际上传仍以20MiB为硬上限，不控制快传。',
  'upload_allowed_extensions':'填写小写扩展名JSON数组，例如["jpg","png","pdf"]；无点号，仅现有文件识别器支持的类型可上传。',
  'media_trash_retention_days':'回收站保留天数，0表示立即到期；到期只进入清理预检，仍需确认清理，不自动删除。',
  'translation_provider':'默认只调用此服务。全空配置使用MyMemory；已有Google密钥而未选服务时保留Google。需要回退时须在翻译操作中明确选择。',
  'translation_providers':'启用服务按所填顺序回退；只有明确选择“按配置回退”才向后续供应商发送原文。',
  'libretranslate_url':'留空使用https://libretranslate.com，官方托管需要密钥。自建实例填HTTPS根地址，并在部署变量TEACHER_TRANSLATION_HOSTS允许该域名。','microsoft_translator_region':'使用资源实际区域，例如eastasia；全球单服务资源可留空，不自动猜测区域。',
  'microsoft_translator_endpoint':'留空使用全球官方地址。自定义HTTPS根地址需部署变量允许该域名；程序添加translate路径和api-version=3.0。','mymemory_email':'可选联系邮箱，仅发送给MyMemory用于联系和额度；不会读取登录账号邮箱。',
  'translation_batch_size':'批量管理中“执行下一批”最多处理的条目数；重试也计入本批上限，范围1–50。','translation_worker_count':'配置并发上限为1–8；低资源调度实际串行执行，不启动额外工作进程。',
  'translation_timeout_seconds':'本条翻译的总等待预算，1–120秒；单次HTTP最多12秒、总共最多20次请求，逐段串行。',
  'publication_metadata_provider':'默认查询只使用此服务；留空按Crossref处理，默认服务必须启用。',
  'publication_metadata_providers':'查询选择“按配置顺序回退”时依次尝试；出现候选即停止，不合并不同论文。',
  'publication_suggestion_cache_seconds':'元数据成功查询的缓存秒数，0关闭；不控制历史字段建议。',
  'publication_display_style':'当前仅保存；访客详情分别展示已填写的多种引文，未使用全局默认样式。',
  'patent_metadata_providers':'当前仅保存，专利联网查询执行器尚未接入。','notify_email':'当前仅保存，邮件通知尚未接入；论文联系邮箱由部署配置提供。',
 },
 'translation_cache':{'translated_text':'人工译文；保存后按当前来源关联生效，原文变化时不会套用旧译文。'},
 'media_assets':{'title':'媒体库中的显示标题，不更改实际文件名或引用。','category':'媒体分类，供媒体库和选择器筛选；不会移动文件。'},
 'messages':{
  'name':'记录留言人姓名。','message_type':'记录咨询、合作等留言类型。','subject':'留言主题，供后台列表检索。','content':'留言正文，仅按记录权限查看；不自动发送回复。',
  'attachment_key':'后台可关联已有附件；当前访客联系表单没有上传入口。','status':'标记处理状态，例如new、read、replied、archived；标记已回复不会发送邮件。',
 },
 'auth_users':{
  'username':'登录使用的唯一用户名；不能与已有账号重复。','display_name':'保存用于识别账号的显示姓名。','role_uid':'请选择启用的角色。系统管理员角色具有管理权限；网站用户角色不自动授予后台管理权限。',
  'status':'新建默认启用；禁用或锁定拒绝登录，角色也必须启用。已有状态保持不变，不能停用当前账号。','must_change_password':'开启后须先改密再进入后台；新账号界面默认开启。',
  'visibility':'控制后台账号记录的可见范围，不会公开账号资料或密码。',
 },
 'auth_roles':{
  'name':'用于账号分配及权限管理的角色名称。','level':'角色等级是属性；实际操作仍检查模块权限。','description':'说明此角色的职责和适用人员。',
  'visibility_scopes':'只在已授权模块中生效；可组合选择，访客页面仍只显示公开内容。',
  'is_active':'控制角色是否有效；系统管理员角色不能停用。',
 },
}

def requirements(table,field,spec):
    """Derive blank handling, formats and limits from runtime validation, never from obsolete prose."""
    native=TABLES[table]['columns'][field];kind=spec['kind'];rules=[]
    if kind=='boolean':return '勾选开启，取消关闭；统一保存后生效。'
    if spec['widget']=='providers':return '至少启用默认服务；回退顺序使用1–'+('5' if field=='translation_providers' else '6')+'的整数。'
    if spec['widget']=='scopes':return '可组合勾选；全部取消时保存空范围，不会自动重新勾选公开。'
    if native.get('nullable'):rules.append('可选，留空清除此项')
    elif native.get('required'):rules.append('必填')
    elif 'default' in native:
        value=native['default'];value=json.dumps(value,ensure_ascii=False,separators=(',',':')) if isinstance(value,(list,dict)) else str(value)
        rules.append('留空使用默认值 '+value)
    else:rules.append('可留空')
    if kind=='integer':
        rules.append('整数')
        if spec.get('min') is not None:rules.append('最小 '+str(spec['min']))
        if spec.get('max') is not None:rules.append('最大 '+str(spec['max']))
    elif kind=='json':rules.append('有效JSON'+('数组' if spec.get('jsonType')=='array' else '对象') if spec['widget'] not in ('scopes','providers') else '通过上方选项设置')
    else:
        formats={'decimal':'非负数，最多4位小数','date':'YYYY-MM-DD','timestamp':'UTC日期时间，如2026-09-14 09:30:00'}
        if native.get('format') in formats:rules.append(formats[native['format']])
        if spec['widget']=='url':rules.append('完整HTTP/HTTPS链接')
        if spec['widget']=='email':rules.append('邮箱格式，例如name@example.org')
        if native.get('minLength'):rules.append('至少'+str(native['minLength'])+'字符')
        if native.get('maxLength'):rules.append('最多'+str(native['maxLength'])+'字符')
    return '；'.join(rules)+'。'

def apply_help(table,specs):
    """Provide every editable field with a meaning and real validation/blank requirements."""
    # Presentation labels must not promise behavior absent from the current renderer.
    labels={'site_settings':{'footer_text':'页脚文本'},'global_settings':{'upload_max_size_mb':'单文件上传上限（MiB）'}}
    for field,spec in specs.items():
        if field in labels.get(table,{}):spec['label']=labels[table][field]
        text=BY_TABLE.get(table,{}).get(field) or COMMON.get(field) or spec.get('help')
        if table=='profiles' and field.endswith('_value'):text='手动记录对应学术指标；0是有效值，当前访客模板未展示这些数值。'
        if table=='publications' and (field.startswith(('citation_','highlight_')) or field=='bibtex'):
            text='根据已填写元数据生成；已有或手动修改内容受保护，取消保护后才重新生成。'+('当前访客模板未展示高亮字段。' if field.startswith('highlight_') else '')
        if spec.get('multiple'):text=(text or '')+' 多项用分号或换行分隔，姓名中的逗号不必拆开。'
        if spec.get('media'):text=(text or '')+' 支持本站媒体链接或HTTP/HTTPS外链；外链由浏览器加载，私密文件请本地上传。'
        spec['help']=text or ('维护'+label(table,field)+'，与当前记录统一保存。')
        spec['requirements']=requirements(table,field,spec)
