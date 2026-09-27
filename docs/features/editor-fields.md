# 统一后台编辑与字段控件

后台使用一个表单及一个控件模板。标签、控件类型、帮助文字和布局由backend/app/native/editor.py统一生成，字段是否可编辑仍由原生编辑契约决定。表格内字段名是数据库真实字段名，不另建同义列。

各页面目录和编辑区来自同一份区块列表。教师身份、联系、简介、自由编写的教育/工作经历、学术链接和显示数值集中维护；每个链接紧邻其数值，0是有效值。翻译、DOI、匹配结果、权限和密钥区按记录类型纳入同页目录。

项目summary是内部说明，不另设英文简介。论文只编辑title；原数据库abstract仍保留但不作为输入项。新闻没有简介字段。多行输入保留用户换行，必填和枚举等最终由服务端校验。

辅助输入框的回车触发对应查询或添加筛选条件，避免误提交整张表单。手机保存栏将状态说明与按钮分行，按钮文字保持完整。

关联候选只读取标识与名称，普通关联最多100条、媒体内部键控件最多20条适用候选，并补回当前已保存选择。不会因为当前记录不在候选首页而自动清空关联。候选仍要求相应模块查看权限；完整媒体搜索复用统一选择器。

统一保存支持保存、保存并返回和分类保存激活；JavaScript可用时显示忙碌状态、阻止重复提交并同步富文本。校验失败或版本冲突保留当前页面输入，不自动覆盖较新版本；断网时提示核实保存结果。输入仅在当前页面保留，不写入浏览器永久缓存；刷新或主动离开仍会丢失未保存修改。无JavaScript时保留标准表单提交。

颜色、字体、字号继续由frontend/admin/static/css/admin-theme.css控制。控件帮助通过标签与aria-describedby提供，开关同时显示文字和状态符号。字段含义和规则由field_help.py统一合并，专用控件复用native-help及native-field-help；详见[字段说明](field-help.md)。

## 字段与编辑区

### 教师与团队（profiles）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 基本身份 | `name` | 中文姓名 | 文本 |
| 基本身份 | `name_en` | 英文姓名 | 文本 |
| 基本身份 | `role` | 团队角色 | 文本 |
| 基本身份 | `title` | 职称或头衔 | 文本 |
| 基本身份 | `organization` | 单位 | 文本 |
| 基本身份 | `lab` | 实验室/团队 | 文本 |
| 基本身份 | `avatar_key` | 头像 | 链接输入＋统一媒体工具 |
| 联系方式 | `email` | 邮箱 | 邮箱 |
| 联系方式 | `phone` | 电话 | 文本 |
| 联系方式 | `office` | 办公室 | 文本 |
| 联系方式 | `contact_visibility` | 联系方式可见性 | 选择 |
| 个人介绍 | `bio` | 中文简介 | 多行文本 |
| 个人介绍 | `bio_en` | 英文简介 | 多行文本 |
| 个人介绍 | `recruiting` | 招生说明 | 多行文本 |
| 教育与工作经历 | `education` | 教育经历 | 多行文本 |
| 教育与工作经历 | `experience` | 工作/科研经历 | 多行文本 |
| 学术与社交链接 | `orcid` | ORCID | 文本 |
| 学术与社交链接 | `orcid_value` | ORCID显示数值 | 整数 |
| 学术与社交链接 | `personal_homepage` | 个人主页 | 链接 |
| 学术与社交链接 | `personal_homepage_value` | 个人主页显示数值 | 整数 |
| 学术与社交链接 | `google_scholar` | Google Scholar | 链接 |
| 学术与社交链接 | `google_scholar_value` | Google Scholar显示数值 | 整数 |
| 学术与社交链接 | `dblp` | DBLP | 链接 |
| 学术与社交链接 | `dblp_value` | DBLP显示数值 | 整数 |
| 学术与社交链接 | `github` | GitHub | 链接 |
| 学术与社交链接 | `github_value` | GitHub显示数值 | 整数 |
| 学术与社交链接 | `cnki` | CNKI | 链接 |
| 学术与社交链接 | `cnki_value` | CNKI显示数值 | 整数 |
| 展示控制 | `visibility` | 内容可见性 | 选择 |
| 展示控制 | `is_active` | 启用成员 | 开关 |
| 展示控制 | `is_featured` | 首页精选 | 开关 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 学生（students）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 基本身份 | `name` | 中文姓名 | 文本 |
| 基本身份 | `name_en` | 英文姓名 | 文本 |
| 基本身份 | `student_id` | 学号 | 文本 |
| 基本身份 | `avatar_key` | 头像 | 链接输入＋统一媒体工具 |
| 培养信息 | `degree` | 培养层次 | 文本 |
| 培养信息 | `category` | 分类 | 多行文本 |
| 培养信息 | `grade` | 年级 | 文本 |
| 培养信息 | `direction` | 研究方向 | 多行文本 |
| 培养信息 | `status` | 状态 | 文本 |
| 入学与毕业 | `enrollment_date` | 入学日期 | 日期 |
| 入学与毕业 | `graduation_date` | 毕业日期 | 日期 |
| 入学与毕业 | `destination` | 毕业去向 | 多行文本 |
| 个人资料 | `email` | 邮箱 | 邮箱 |
| 个人资料 | `homepage` | 个人主页 | 链接 |
| 个人资料 | `awards` | 获奖情况 | 多行文本 |
| 个人资料 | `bio` | 简介 | 多行文本 |
| 展示控制 | `contact_visibility` | 联系方式可见性 | 选择 |
| 展示控制 | `visibility` | 内容可见性 | 选择 |
| 展示控制 | `is_featured` | 首页精选 | 开关 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 学生分类（student_category_displays）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 分类标识 | `key` | 分类 Key | 文本 |
| 分类标识 | `label` | 中文标签 | 文本 |
| 分类标识 | `label_en` | 英文标签 | 文本 |
| 匹配规则 | `keywords` | 匹配关键词 | 多行文本 |
| 启用与排序 | `enabled` | 启用 | 开关 |
| 启用与排序 | `display_order` | 显示顺序 | 整数 |

### 研究方向（research_interests）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 方向内容 | `name` | 中文名称 | 文本 |
| 方向内容 | `name_en` | 英文名称 | 文本 |
| 方向内容 | `description` | 方向说明 | 多行文本 |
| 展示控制 | `visibility` | 可见性 | 选择 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 科研项目（projects）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 项目信息 | `name` | 项目名称 | 多行文本 |
| 项目信息 | `source` | 项目来源 | 文本 |
| 项目信息 | `fund_name` | 基金/计划名称 | 文本 |
| 项目信息 | `project_number` | 项目编号 | 文本 |
| 项目信息 | `project_role` | 承担角色 | 多行文本 |
| 项目信息 | `status` | 项目状态 | 文本 |
| 项目人员 | `principal` | 负责人 | 文本 |
| 项目人员 | `members` | 项目成员 | 多行文本 |
| 时间与经费 | `start_date` | 开始日期 | 日期 |
| 时间与经费 | `end_date` | 结束日期 | 日期 |
| 时间与经费 | `amount` | 经费金额（万元） | 文本 |
| 内部说明 | `summary` | 项目简介 | 多行文本 |
| 展示控制 | `visibility` | 内容可见性 | 选择 |
| 展示控制 | `is_featured` | 首页精选 | 开关 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 论文（publications）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 题名与作者 | `title` | 论文题名 | 多行文本 |
| 题名与作者 | `authors` | 作者列表 | 多行文本 |
| 题名与作者 | `author_role` | 作者角色 | 多行文本 |
| 题名与作者 | `corresponding_authors` | 通讯作者 | 多行文本 |
| 发表信息 | `venue` | 期刊或会议 | 文本 |
| 发表信息 | `year` | 年份 | 整数 |
| 发表信息 | `volume` | 卷号 | 文本 |
| 发表信息 | `issue` | 期号 | 文本 |
| 发表信息 | `pages` | 页码/文章号 | 文本 |
| 发表信息 | `doi` | DOI | 文本 |
| 发表信息 | `url` | 外部链接 | 链接 |
| 分类与标签 | `publication_type` | 论文类型 | 多行文本 |
| 分类与标签 | `index_type` | 收录/索引类型 | 多行文本 |
| 分类与标签 | `display_tags` | 展示标签 | 多行文本 |
| 分类与标签 | `keywords` | 关键词 | 多行文本 |
| 附件 | `pdf_key` | PDF  | 链接输入＋统一媒体工具 |
| 附件 | `pdf_visibility` | PDF 可见性 | 选择 |
| 原始引用与输入辅助 | `source_citation` | 原始引用文本 | 多行文本 |
| 多格式引用 | `citation_gbt` | GB/T 引用 | 多行文本 |
| 多格式引用 | `citation_elsevier` | Elsevier 引用 | 多行文本 |
| 多格式引用 | `citation_apa` | APA 引用 | 多行文本 |
| 多格式引用 | `citation_ieee` | IEEE 引用 | 多行文本 |
| 多格式引用 | `bibtex` | BibTeX | 多行文本 |
| 多格式引用 | `highlight_gbt` | GB/T 高亮文本 | 多行文本 |
| 多格式引用 | `highlight_elsevier` | Elsevier 高亮文本 | 多行文本 |
| 多格式引用 | `highlight_apa` | APA 高亮文本 | 多行文本 |
| 多格式引用 | `highlight_ieee` | IEEE 高亮文本 | 多行文本 |
| 展示控制 | `visibility` | 内容可见性 | 选择 |
| 展示控制 | `is_featured` | 首页精选 | 开关 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 专利软著（patents）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 名称与类型 | `name` | 名称 | 多行文本 |
| 名称与类型 | `country` | 国家或地区 | 文本 |
| 名称与类型 | `patent_type` | 类型 | 文本 |
| 编号与日期 | `application_number` | 申请号 | 文本 |
| 编号与日期 | `grant_number` | 授权号 | 文本 |
| 编号与日期 | `application_date` | 申请日期 | 日期 |
| 编号与日期 | `grant_date` | 授权日期 | 日期 |
| 权属信息 | `inventors` | 发明人/作者 | 多行文本 |
| 权属信息 | `owner` | 权利人 | 多行文本 |
| 权属信息 | `legal_status` | 法律状态 | 文本 |
| 说明与附件 | `summary` | 简介 | 多行文本 |
| 说明与附件 | `certificate_key` | 证书 | 链接输入＋统一媒体工具 |
| 展示控制 | `visibility` | 内容可见性 | 选择 |
| 展示控制 | `is_featured` | 首页精选 | 开关 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 课程（courses）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 课程信息 | `name` | 课程名称 | 文本 |
| 课程信息 | `semester` | 开课学期 | 文本 |
| 课程信息 | `audience` | 授课对象 | 多行文本 |
| 教学资料 | `summary` | 课程简介 | 多行文本 |
| 教学资料 | `references_text` | 参考资料 | 多行文本 |
| 教学资料 | `syllabus_key` | 教学大纲 | 链接输入＋统一媒体工具 |
| 教学资料 | `material_key` | 课程材料 | 链接输入＋统一媒体工具 |
| 展示控制 | `material_visibility` | 材料可见性 | 选择 |
| 展示控制 | `visibility` | 内容可见性 | 选择 |
| 展示控制 | `is_featured` | 首页精选 | 开关 |
| 展示控制 | `sort_order` | 人工排序 | 整数 |

### 新闻动态（news）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 基本信息 | `title` | 标题 | 文本 |
| 基本信息 | `slug` | Slug | 文本 |
| 基本信息 | `category` | 分类 | 文本 |
| 封面与正文 | `cover_key` | 封面图 | 链接输入＋统一媒体工具 |
| 封面与正文 | `content` | 正文 | 多行文本 |
| 封面与正文 | `content_format` | 正文格式 | 选择 |
| 关联记录 | `related_publication_uid` | 关联论文 | 选择 |
| 关联记录 | `related_project_uid` | 关联项目 | 选择 |
| 关联记录 | `related_student_uid` | 关联学生 | 选择 |
| 发布与展示 | `allow_comments` | 允许评论或留言入口 | 开关 |
| 发布与展示 | `published_at` | 发布时间 | 文本 |
| 发布与展示 | `visibility` | 可见性 | 选择 |
| 发布与展示 | `is_featured` | 精选 | 开关 |
| 发布与展示 | `sort_order` | 排序 | 整数 |

### 导航与按钮（navigation_items）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 名称与图标 | `title` | 中文文本 | 文本 |
| 名称与图标 | `title_en` | 英文文本 | 文本 |
| 名称与图标 | `icon` | 图标 | 选择 |
| 目标与固定筛选 | `kind` | 类型 | 选择 |
| 目标与固定筛选 | `url_name` | 入口标识（ASCII） | 文本 |
| 目标与固定筛选 | `path` | 链接路径 | 多行文本 |
| 目标与固定筛选 | `fragment` | 页面锚点 | 文本 |
| 展示设置 | `style` | 样式 | 选择 |
| 展示设置 | `location` | 位置 | 选择 |
| 展示设置 | `visibility` | 可见性 | 选择 |
| 展示设置 | `enabled` | 启用 | 开关 |
| 展示设置 | `sort_order` | 排序 | 整数 |

### 网站设置（site_settings）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 站点与首页 | `site_name` | 中文站点名称 | 文本 |
| 站点与首页 | `site_name_en` | 英文站点名称 | 文本 |
| 站点与首页 | `hero_title` | 首页主标题 | 文本 |
| 站点与首页 | `hero_subtitle` | 首页副标题 | 多行文本 |
| 站点与首页 | `homepage_publication_limit` | 首页论文数量 | 整数 |
| 站点与首页 | `homepage_news_limit` | 首页动态数量 | 整数 |
| 品牌图片 | `logo_key` | Logo | 链接输入＋统一媒体工具 |
| 品牌图片 | `favicon_key` | 浏览器图标 | 链接输入＋统一媒体工具 |
| 品牌图片 | `og_image_key` | 社交分享图 | 选择 |
| 搜索与分享 | `seo_title` | SEO 标题 | 文本 |
| 搜索与分享 | `seo_description` | SEO 描述 | 多行文本 |
| 搜索与分享 | `seo_keywords` | SEO 关键词 | 文本 |
| 页脚 | `footer_text` | 页脚文本 | 多行文本 |
| 启用配置 | `is_active` | 当前启用 | 开关 |

### 全局设置（global_settings）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 网站互动与上传 | `allow_public_registration` | 允许公开注册 | 开关 |
| 网站互动与上传 | `allow_anonymous_messages` | 允许匿名留言 | 开关 |
| 网站互动与上传 | `upload_max_size_mb` | 单文件上传上限（MiB） | 整数 |
| 网站互动与上传 | `upload_allowed_extensions` | 允许上传扩展名 | 多行文本 |
| 网站互动与上传 | `media_trash_retention_days` | 回收站保留天数 | 整数 |
| 翻译服务与调度 | `translation_provider` | 默认翻译服务 | 文本 |
| 翻译服务与调度 | `translation_providers` | 可用翻译服务 JSON | 多行文本 |
| 翻译服务与调度 | `libretranslate_url` | LibreTranslate 地址 | 链接 |
| 翻译服务与调度 | `microsoft_translator_region` | Microsoft 区域 | 文本 |
| 翻译服务与调度 | `microsoft_translator_endpoint` | Microsoft Endpoint | 链接 |
| 翻译服务与调度 | `mymemory_email` | MyMemory 邮箱 | 邮箱 |
| 翻译服务与调度 | `translation_batch_size` | 每批翻译条数 | 整数 |
| 翻译服务与调度 | `translation_worker_count` | 翻译并发数 | 整数 |
| 翻译服务与调度 | `translation_timeout_seconds` | 翻译超时（秒） | 整数 |
| 论文与专利辅助 | `publication_metadata_provider` | 默认论文服务 | 选择 |
| 论文与专利辅助 | `publication_metadata_providers` | 启用服务与回退顺序 | 启用与顺序 |
| 论文与专利辅助 | `publication_display_style` | 论文引用样式 | 文本 |
| 论文与专利辅助 | `patent_metadata_providers` | 专利元数据服务 JSON | 多行文本 |
| 通知联系 | `notify_email` | 系统通知邮箱 | 邮箱 |

### 翻译（translation_cache）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 人工译文 | `translated_text` | 译文 | 多行文本 |

### 媒体库（media_assets）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 媒体信息 | `title` | 标题 | 文本 |
| 媒体信息 | `category` | 分类 | 多行文本 |

### 留言（messages）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 留言信息 | `name` | 留言人姓名 | 文本 |
| 留言信息 | `email` | 留言人邮箱 | 邮箱 |
| 留言信息 | `message_type` | 留言类型 | 文本 |
| 留言信息 | `subject` | 主题 | 多行文本 |
| 留言信息 | `content` | 留言正文 | 多行文本 |
| 留言信息 | `attachment_key` | 附件 | 链接输入＋统一媒体工具 |
| 处理状态 | `status` | 处理状态 | 文本 |
| 处理状态 | `visibility` | 记录可见性 | 选择 |

### 账号与权限（auth_users）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 账号资料 | `username` | 登录用户名 | 文本 |
| 账号资料 | `display_name` | 显示名称 | 文本 |
| 账号资料 | `email` | 邮箱 | 邮箱 |
| 角色与状态 | `role_uid` | 所属角色 | 选择 |
| 角色与状态 | `status` | 账号状态 | 选择 |
| 角色与状态 | `must_change_password` | 要求修改密码 | 开关 |
| 角色与状态 | `visibility` | 记录可见性 | 选择 |

### 角色与权限（auth_roles）

| 编辑区 | 字段 | 名称 | 控件 |
| --- | --- | --- | --- |
| 角色资料 | `name` | 角色名称 | 文本 |
| 角色资料 | `level` | 角色等级 | 整数 |
| 角色资料 | `description` | 角色说明 | 多行文本 |
| 范围与状态 | `visibility_scopes` | 可查看的记录范围 | 范围复选组 |
| 范围与状态 | `is_active` | 角色启用标记 | 开关 |
| 范围与状态 | `sort_order` | 人工排序 | 整数 |


论文引用字段的独立保护、DOI差异核对、草稿回填和撤销规则见[论文引文与DOI辅助](publication-assistance.md)。这些状态由浏览器编辑页管理，不增加数据库列。


## 媒体字段预览

原生媒体外键共用native-media-field组件，选择旁显示完整等比图片/视频预览，横竖比例差异自动留白；PDF和附件可在新标签打开预览详情。预览与选择、保存相互独立，文件缺失和回收状态保留明确提示。具体权限、读取上限及目录核对见media.md。


媒体字段使用链接输入框；“选择 / 上传”共用单一弹窗，可搜索全部适用媒体并上传本地文件；隐藏的原生键控件只加载最近20项及当前选择。确认回填仅触发当前字段的普通change事件，取消保留原值，后台固定保存栏负责最终建立引用。字段类型表及错误/权限行为见media.md。

当前值为活跃图片时，字段旁提供“编辑图片”，在同一选择器内打开统一裁剪窗口。自由/固定/自定义比例、原图坐标框选、缩放拖动、像素数值输入及输出均由共享编辑器处理；最终仍通过普通字段change与现有保存栏建立引用。图片编辑输出为新文件，原图和其他使用位置不被覆盖。


所有媒体字段可以直接输入链接，选择器增加“媒体链接”来源。输入及预览保持草稿，整表保存时解析关联并原子登记新外链；也可在选择器明确登记。外链类型由用户声明，原生媒体键继续由服务器管理，详见[统一媒体链接](media-links.md)。
