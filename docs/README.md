# 网站功能与使用手册

适用源码：v0.16.127。此轮只整理文档，不修改程序、数据库、缓存或同步协议。以本包源码为准；reference 保存的原始规格与验收设计不代表全部目标均已实现。

## 阅读顺序

| 文档 | 内容 | 读者 |
| --- | --- | --- |
| [本手册](README.md) | 网站功能、后台操作、前台行为、功能与代码对应关系 | 使用者、管理员 |
| [源码与函数索引](SOURCE.md) | 当前 Python 函数签名、路由处理器、前端函数和模板入口 | 开发者 |
| [部署、数据与维护](OPERATIONS.md) | Windows/Linux/Cloudflare、配置、升级、同步、备份及故障排查 | 运维人员 |
| reference/ | 原始项目规格，全部保留，可能包含早期目标或版本说明 | 设计对照 |

历史阶段计划、发布记录、测试输出、重复说明和示例文档已从本目录移除；必要的现行说明归并到上述三份文件。测试程序仍保留在 tests 等原目录。reference 的文本和文件名未改动。所有路径均相对项目根目录；本手册提及的函数为实际定义，不是新的公开 API。

## 1. 网站结构和公开内容

本地 Windows 与 Ubuntu/Debian 使用单一 HTTP 服务，网站和文件快传共用主站登录及数据库。Cloudflare 使用主入口和现有辅助组件，细节见部署手册。网页使用 Jinja 模板加原生 JavaScript，不需要前端打包才能运行。

| 功能 | 前台入口 | 内容和用法 | 主要实现 |
| --- | --- | --- | --- |
| 首页 | /zh、/en | 展示配置的教师、研究与精选内容；在网站设置和条目展示字段中控制 | backend/app/native/public_home.py：homepage_rows；frontend/public/templates/home.html、home-section.html、home-card.html |
| 教师与团队 | /{lang}/profiles、/{lang}/profiles/{uid} | 卡片含职称/单位、公开联系方式、学术链接及简介；详情查看完整资料 | public_data.py：public_listing；person-card.html、person-identity.html、person-links.html、person-detail.html |
| 学生 | /{lang}/students | 学位/分类/年级/状态标签，日期与研究信息紧凑排列；简介最多两行，可展开 | public_students.py：rules_for、group_expression、annotate；person-fields.html、person-card.html |
| 研究方向 | /{lang}/research_interests | 展示公开方向、描述及相关媒体 | public_data.py：public_listing；content-card.html、content-body.html |
| 项目 | /{lang}/projects | 项目来源、编号、角色、周期和状态；非公开字段不写入共享页面或 Read Model | public_data.py：project_private_allowed；project-card.html；public-session.js：apply、pump |
| 论文 | /{lang}/publications | 多格式引文、通讯作者、高亮、索引/标签、DOI、原文及公开 PDF | public_citations.py：saved_citations；citation.html、publication-tags.html、content-links.html |
| 专利/软著 | /{lang}/patents | 类型、发明人/作者、权利人、申请信息；授权状态/号/日期相邻，证书附件 | patent-card.html；content-links.html；public-list.js：compactCard |
| 课程 | /{lang}/courses、/{lang}/courses/{uid} | 学期与授课对象同行；简介展开、课程资料与大纲按权限展示 | course-card.html、content-detail.html；public_descriptions.py：public_description |
| 新闻动态 | /{lang}/news、/{lang}/news/{uid} | 图文/视频封面、时间、多个分类、富文本/PDF正文及关联内容 | news_body.py：news_html；news-media.html、content-fields.html、content-detail.html |
| 联系与留言 | /{lang}/contact | 访客按表单提交留言，受来源、短时表单令牌和频率限制；新闻中的留言上下文保留来源 | public_contact.py：form_context；public_actions.py：contact、throttle；contact-form.html |
| 固定筛选入口 | /{lang}/n/{nav} | 按后台“导航与按钮”的公开配置展示固定范围；访客附加筛选仍受固定条件约束 | public_navigation.py：load、resolve、visitor_query；web_public.py：install.public_navigation_entry |

表中省略目录的 Python 文件位于 backend/app/native，HTML 位于 frontend/public/templates，JS 位于 frontend/public/static/js。lang 仅为 zh/en；uid 是条目标识；nav 是后台配置的 url_name。不要根据 URL 格式推断权限，实际记录、公开状态和配置仍由服务端验证。

## 2. 搜索、筛选、排序、分页与自动续页

普通公开列表在可用时读取一次 /api/public/data/{lang}/{table}，取得不含会话、权限、后台或私有字段的粗粒度 Read Model。完整模型满足边界后由浏览器本地搜索、筛选、排序和分页；切换条件不重复查询数据库。模型缺失、超限、网络失败或旧 HTML 缺少必要模板时保留服务端列表路径，不展示半份模型。

固定导航 /n/{nav} 与首页不启用普通列表本地模型，继续使用原服务端范围与渐进片段；它们不是导航专用 PublicData。滚动接近下方自动追加下一页；保留原分页按钮、筛选和排序，失败暂停且可手动继续，不循环重试。无 IntersectionObserver 使用滚动/resize 回退。详情返回链接携带 from，经服务端检查后返回原列表条件。

主要函数：public_read_model.py 的 build(r, table, lang, *, limits=None)；public_read_api.py 的 generate、install.public_data；public-list.js 的 decode、result、render、card、publicationCard、newsCard、compactCard；public-stream.js 的既有观察、调度和片段追加函数（完整名称见源码索引）；public_navigation.py 的 list_return、query_url、query_identity。不要向 Read Model 生成函数传任意访客 query 或登录 principal。

## 3. 卡片、字体、颜色与手机导航

教师/学生使用 person-card、person-fields、person-links，论文/新闻/专利/课程等使用 content-card、content-body 及对应子模板；首页复用相应内容体。JS 动态论文、新闻、专利和课程卡片克隆现有 HTML 模板，避免另写一套视觉结构。列表图标来自 card-icons.html；品牌图标位于 frontend/public/static/vendor/brand-icons。个人简介沿用 description-button、description-attributes 和 public-people.js 的展开/延迟全文机制。

学生卡片取消旧固定最小高度，常规宽屏信息目标约四行，长信息或放大字号会自然增加行数；简介收起最多两行，不裁掉其他字段。专利申请号/日期同组，授权状态/号/日期同组。课程学期与授课对象共用 flex 行。论文、学生、课程及专利摘要/记录使用公共 --public-ink 深色。

统一设置位于 frontend/shared/static/css/public-theme.css；字体、行高、颜色通过 --public-* 变量控制，阅读设置逻辑为 frontend/shared/static/js/public-controls.js。academic.css、faculty.css、public-controls.css 只使用公共变量搭建布局。修改某个卡片时同时检查 SSR、PublicData 动态显示、固定导航和首页，避免局部硬编码字体或颜色。

页头由 header.html 与 academic.js 的 enhancePublicHeader 协作：Logo/文字靠左，字体/语言/账号靠右，导航占中间空间；宽度不足时导航独占第二行并水平滚动。手机使用独立悬浮折叠按钮和浮动侧栏，侧栏自行滚动，不挤压正文；保留 Logo、阅读设置、语言与账户区域。菜单按钮的键盘、焦点、Esc 与遮罩行为复用当前实现。

## 4. 多值字段与姓名边界

收录/索引类型、展示标签、新闻分类等明确多值字段以英文分号、中文分号或换行分隔；去掉空项及重复项。英文逗号和中文逗号保留，不把 Smith, John 或包含逗号的分类拆开。论文通讯作者按相同边界展示，复制引文和姓名高亮仍保留各自格式规则，不能把所有文本解析统一替换为同一个 splitter。

服务端：suggestions.py 的 split_values 由 backend/app/web/rendering.py 注册为模板过滤器；后台新闻分类筛选由 filtering.py 的 contains_predicate、compile_conditions 和数据层既有多值逻辑处理。前端：public-list.js 的 splitValues、publicationCard、newsCard；frontend/public/static/js/public-authors.js；后台 native-corresponding-authors.js、native-editor.js、native-navigation.js。字段填写说明来自 field_help.py 和原生 editor-contract。

在后台新闻编辑中填写“学术动态;研讨, Forum”会显示两个分类；选择“学术动态”仅匹配含该项的记录，不能把“学术动态研究所”当作同项。自由搜索与分类单项筛选是不同操作。

## 5. 登录、注册、身份显示和权限

公开缓存 HTML 始终是匿名视图，默认显示用户图标及登录按钮。当前登录弹窗成功响应携带显示身份，JS 立即更新当前页面并安全保存标签页快照；后续切页先显示快照，再静默确认 Cookie 会话。后台操作始终实时鉴权；快照绝不能授权保存、删除、私有数据或后台访问。

登录/注册通过 /auth/login、/auth/register；注册受全局 allow_public_registration 控制，登录/注册挑战令牌与同源检查继续执行。退出 /auth/logout 撤销会话，修改密码 /auth/password 撤销旧会话。账号服务为 auth.py 的 Auth.login、principal、public_principal、require、guard、logout、password；public_auth.py 的 safe_next、install.auth_post 处理安全跳转及身份结果。

显示身份通道 /api/public/session-summary 位于 public_session.py：session_summary、install.summary；public-auth.js 处理登录交接；public-session.js 的 defaultLogin、identity、start、changed 管理显示与请求代次；frontend/shared/static/js/identity-cache.js 管理 sessionStorage 五字段快照。查询明确 authenticated=false 才更新为未登录；500/503、网络失败、超时、abort、1101/1102 不能覆盖上次成功身份 UI。旧请求不得覆盖刚登录的新状态。活跃可见页面的后台心跳与服务端会话写入限制见部署手册。

账号/角色/权限在后台 auth_users/auth_roles 编辑。权限按模块和 view/create/edit/delete 等动作及可见范围生效，账号组删除前核对依赖和系统账号限制。accounts.py 的 can_manage、deletion_plan，permissions.py 的 validate、lock_references，Auth.require/guard 是权限入口。前端 native-access.js、native-accounts.js 仅提示和操作 UI，服务器再次核验。

## 6. 后台通用列表和编辑

入口 /admin 显示有权限的模块；/admin/{table} 是普通列表，/admin/n/{nav} 是受固定条件约束的管理入口。使用搜索、列筛选、排序、页码、显示列、选择/批量动作、复制和导出。列表片段刷新不放宽权限。新增/编辑/删除、媒体选取和导出都复核当前权限、记录版本；固定导航还验证配置更新时间和当前范围。

主入口 web_admin.py 的 install.dashboard、list_page、resolve、editor、save、row_action、export；Content.listing/get/save/delete/audit 位于 content.py。catalog.py 的 fields、defaults、normalize 加载 database/native/schema-spec.json 与 editor-contract.json，不要仅改模板新增数据库字段。editor.py 的 editor_fields、editor_sections、reference_choices 提供统一表单；field_help.py 提供填写规则；list_columns.py 的 column_layout 配置推荐列。

前端通用控制：native-list.js、native-editor.js、native-http.js、native-notifications.js、native-columns.js 和 native-table-*；共享表单保存栏及顶部区块导航复用现有 native-edit.html 等模板。失败保留输入；迟到辅助结果不替换新草稿。页面无 JavaScript 时可执行支持的基础表单操作，裁剪/富文本/辅助回填等仍需要 JS。

## 7. 学生分类

后台 students 编辑个体资料，student_category_displays 配置分类展示与匹配。先填写分类规则，再用匹配名单核对覆盖；前台学生分组来自现行规则，并保留排序与可见性。student_categories.py 的 parse_keywords、match_page；public_students.py 的 rules_for、group_expression、annotate；web_admin.py 的 install.student_matches；前端 native-student-categories.js。分类显示规则不是新的权限规则，不得公开非公开学生。

## 8. 导航、按钮、页脚、网站设置

后台 navigation_items 管理标题、url_name、位置、顺序、类型、启用与可见性。公开固定条件使用导航编辑器生成 /{lang}/n/{nav}，后台固定范围为 /admin/n/{nav}；使用预览核对条件，不手工拼任意 SQL。外部链接/锚点沿用 URL 与 HTML 安全校验。修改导航后提交成功才通知现有公开缓存失效通道。

navigation.py 的 build_path、parse_path、build_public_path、parse_public_path、preview、in_scope、navigation_guard；navigation_options.py 的 grouped_menu、sidebar_presentation；public_footer.py 的 navigation、navigation_link、footer_html；native-navigation.js。footer_html 在现有清洗策略下展示页脚，不把任意脚本交给浏览器执行。原 docs/examples 的演示内容不再保留为独立文档；实际页脚用网站设置输入。

site_settings 管理站点名称、Logo、首页教师、引文格式及展示配置；global_settings 管理注册、外部服务、限制和维护配置。按实际表单说明填写，统一保存后生效；含密钥的完整备份不能公开。公共背景/图案、字体、语言、PDF 阅读等由公共设置及公共组件控制，不绕过服务端读取权限。

## 9. 论文录入、引文与元数据检索

在 publications 新建或编辑：填写题名、作者/通讯作者、发表信息、分类/索引/标签、DOI、附件及展示字段。多格式引文支持 GB/T、Elsevier、APA、IEEE 和 BibTeX；每项文本/高亮可保护，背景生成只更新未保护项，“更新全部引用”明确重新生成。原文解析与元数据回填先改变草稿，统一保存才写数据库；字段附近保留来源、原值和独立撤销，手工修改受到保护。

“提取首页教师”读取当前首位公开、启用、精选教师姓名，依各引用格式自动匹配实际出现的高亮文本；不能推断不存在的英文名或调用翻译补齐。publication-tools.mjs、native-publications.js、native-draft-review.js、native-corresponding-authors.js 实现草稿和格式；editor.py 的 citation_profile；web_admin.py 的 install.publication_profile。

元数据检索可在论文编辑或独立检索页按 DOI/题名查找，支持配置中的 Crossref、OpenAlex、Semantic Scholar、DataCite、Europe PMC、PubMed；选择候选再回填合法非空字段，缺失字段不清空旧值。默认服务/指定服务/顺序回退按有效配置执行，失败可手动重试，不自动创建论文。metadata_search.py：MetadataSearch.search、source、cached；metadata_providers.py：retrieve；metadata_config.py：load_settings；web_admin.py：install.metadata、metadata_page；native-metadata-query.js。服务端凭据与允许目标地址受限制，不在网页公开密钥。

## 10. 翻译、来源定位和批次

全局设置选择服务、顺序、默认供应商和凭据，显式测试连接后保存；推荐值只填写草稿，不覆盖其他设置。当前翻译支持 MyMemory、Google、DeepL、Microsoft、LibreTranslate；供应商实际可用性、计费和授权以对应配置为准。普通启动和访客切换语言不会自动调用翻译 API。

单条辅助翻译由 Assistance.translate 与 TranslationService.execute/execute_many 执行；translation_config.py 校验供应商配置，translation_http.py 限制请求和响应。富文本翻译通过 TranslationDocument 保留允许的 HTML 结构。已有英文手填、原文摘要、译文状态和优先级共同决定展示；改变原文后不能继续使用旧译文。

翻译后台按组浏览来源、状态与版本，查看原文定位，选择人工/已有译文，或发起单条/批量任务。TranslationGroups.listing/sources/choose/export（translation_groups.py），TranslationReuse.candidates/try_reuse（translation_reuse.py），TranslationBatch.action/step/run/invalidate（translation_batch.py），PackedBatch.run（translation_packed_batch.py）复用既有来源、队列、预算和权限。translation_sources.py 的 reference、source_format、candidate、overlay，source_links.py 的 field_link、translation_context 提供来源定位。前端 native-translation-groups.js、native-translation-batch.js、native-source-focus.js。批次状态/进度不是普通公开数据，不进入 PublicData。

## 11. 新闻正文、媒体和 PDF

新闻可填写文本/允许的富文本，编辑窗口、图片尺寸、裁剪、关联论文/项目/学生、封面图或视频、PDF 阅读与留言来源使用现有模块。保存通过 news_html 清洗展示内容；native-richtext.js、native-richtext-window.js 和 frontend/shared/static/js/news-reader.js 负责编辑/阅读，正文媒体引用仍受媒体登记和权限控制。

媒体库 /admin/media_assets 管理登记、原文件、预览、使用位置与回收站。编辑字段可上传、从媒体库选择、裁剪生成副本或明确登记合法外链；选取只改变草稿，保存内容才建立业务引用。Media.upload/readable/inspect/status（media.py），MediaPicker.listing/select/upload/crop_upload（media_picker.py），MediaLinks.resolve/statements（media_links.py），MediaReferences.locations/used/public_body_reference（media_references.py）是主要入口。原文件与裁剪副本分开登记，不覆盖共享原图。

回收站和永久删除先检查引用、版本、权限及物理对象。/admin/media/audit 用于显式分批核对登记与存储，发现缺失、未登记或异常文件，预检后导入/清理；它不是 Public Cache 定时巡检。MediaAudit.start/step/page/prepare_import/commit_import/prepare_purge/commit_purge（media_audit.py）；媒体 picker、audit、crop、locations 等前端复用现有模块。

媒体访问经 /media/{uid} 或现行文件键路由，由 web_public.install.media、media_response、media_file_response 校验可读性；GET/HEAD、ETag/304、Range 在相应存储适配器中处理。公开引用和私有授权是独立规则，不能因为链接可见就跳过服务端权限。PDF 缩放/翻页/打开使用 frontend/shared 的 PDF 组件，只有公开附件可进入共享读模型。

## 12. 留言、操作日志与会话管理

messages 后台保留访客原文，仅允许授权处理字段和状态，不把管理列表当新建留言入口。messages.py 的 validate、presentation、views；message_log_admin.py 的 install.detail；native-message-logs.js 负责详情、复制和批量状态。

operation_logs 提供有界搜索、详情和脱敏导出；Logs.listing/get/export（operation_logs.py），log_privacy.py 的 text/detail/record，data_tools.py 的 csv_cell 处理脱敏和 CSV 公式防护。不把日志里的密钥、Cookie 或服务器异常栈回显为公开内容。

账号登录会话可查看、筛选和撤销，Sessions.listing/revoke（sessions.py），session_admin.py 的 install.listing/revoke，native-sessions.js。撤销或改密码由服务端生效；浏览器身份快照仍只用于显示，下一次明确身份结果纠正 UI。

## 13. 数据备份和恢复

后台 /admin/data_tools 或 /admin/import-export 选择业务表，导出 JSON/单表 CSV，或浏览器加密 ACMS；恢复先预检，再按显示的新增/更新/删除范围确认。详细格式、媒体暂存、覆盖、容量和完整数据库备份见部署手册。

data_tools.py：export、csv_export、authorize、selection；data_restore.py：preflight、stage、execute、discard；data_admin.py：install.download/preflight/stage/execute；native-data-tools.js、native-data-crypto.js。业务备份不等于账号/会话/部署/快传全盘备份，恢复不能跳过服务器授权和版本检查。

## 14. 示例中心

后台示例中心按模块显示现有覆盖，显式添加样例、依赖和进度，不覆盖已有真实记录；普通启动不会自动填充新版示例。Examples.status/step/assets（examples.py），example_catalog.py 的 identity、values、permission_preset，frontend_examples.py 的 FrontendExamples.step/import_batch，example_admin.py 的 install；CLI 为 python -m backend.cli seed-examples。示例账号和媒体仅用于受控测试，添加样例仍走正式权限和存储服务。

## 15. 文件快传

/transfer/ 提供局域网直连、双方在线中转、临时缓存分享；支持普通文件和具备浏览器能力的目录传输、分块上传、进度、暂停/恢复/撤销、分享次数及有效期。直连通过 WebRTC 配对，不能仅凭连接成功承诺实际物理局域网路由；目录读写需要安全上下文及浏览器能力，普通单文件下载不等于目录可写。目录句柄一般不能跨刷新自动恢复。

本地仅启动主服务，transfer/backend/integration.py 的 install 接入同站身份；transfer/backend/native.py 的 app_factory 和 Transfers.create/chunk/control/policy 管理任务；chunks.py、indexed.py、folders.py、folder_receiver.py、lan.py、relay.py、offline.py、live_folders.py 提供分片/文件夹/传输适配。实际 /transfer 下接口继承挂载前缀，不能把源码索引中的子应用 /api/tasks 当主站根接口。

后台 transfer 管理规则、用户/角色配额、匿名下载、大小、并发、保留时间、次数和任务控制；management.py 的现有管理服务、settings.py、accounting.py 共同执行额度。网络中断、取消和磁盘失败不得算完成；既有文件不会因目录接收被无提示覆盖。快传缓存是业务文件存储，与 PublicPage/PublicData 共享响应缓存不同。

## 16. 两站同步

后台 /admin/site-sync 分为连接与授权、创建、定时计划、任务监控、执行参数。两端共享密钥、保存对端根地址和授权；连通性检查通过后小范围验证，再使用拉取、推送或接收站定时拉取。账号组、依赖、删除、完整恢复和重试细节见部署手册。

site_sync/integration/web.py：install；host.py：configure、runtime、tick、refresh_scopes；website.py：TeacherWebsite.discover/snapshot/source_read/apply；credentials.py：generate、save、resolve；site_sync/admin/service.py：Admin.create/command/tasks/detail/logs/save_schedule；site_sync/runtime/schedules.py：Schedules.tick；site_sync/integration/worker_schedule.py：arm、run。任务发现、快照、分片、checkpoint、租约和应用通过 site_sync/core、adapters、transport、worker 的现有引擎实现，不另建恢复层。

## 17. 运行维护和公开缓存

后台 /admin/runtime-maintenance 查看状态，配置既有维护策略，显式预览/执行清理，系统管理员可维护公开模块缓存。Maintenance.tick/run（backend/maintenance/runtime.py），Monitor.snapshot（monitor.py），maintenance_admin.py 的 install.status/action；前端 native-maintenance.js、native-public-cache.js。媒体巡检、会话/日志保留及已存在的定时维护各自独立，不能据此给 Public Cache 新增 Cron 扫描。

当前公开缓存固定策略：标准成功匿名 HTML 浏览器1800秒，固定公开导航无 query 基础页浏览器60秒、边缘120秒；PublicData 固定八模块×两语言端点浏览器300秒、边缘1800秒。Admin/Auth/session-summary/私有接口/写请求关闭共享缓存。成功标记、ETag、标签、invalidate/purge 及故障边界详见部署手册；当前功能不支持无限 query 缓存、不缓存 SQL，也没有 Linux 页面 LRU/预取层。

## 18. 时间、搜索引擎与统一基础设施

内部时间与版本令牌使用规定的 UTC 格式，后台输入/展示转换为配置时区；time_fields.py 的 to_utc、form_times、zone，backend/app/domain/admin_presentation.py 的 admin_datetime 与 native-time.js 共同处理。不要把本地输入直接当 UTC 文本，也不要用格式化时间覆盖 updated_at 乐观锁。

robots.txt、sitemap.xml 和分模块 sitemap 由 public_seo.py 的 robots、stats、index、chunk 与 web_public 对应处理器生成，遵循公开筛选。多语言共享同一业务记录，英文内容来源于明确英文字段和有效翻译。多域名/HTTPS/Cookie 同源规则由 backend/app/security/origins.py 与 http.py 配置，新增域名要同时核对平台绑定和应用允许来源。

## 19. 历史输入建议与辅助操作

后台输入辅助按账号可查看模块和字段，检索已有值并选择填入草稿；多值去重按该字段语义处理，不把姓名逗号拆开。suggestions.py 的 suggestion_catalog/suggestions/normalized，web_admin.py 的 install.history_page/history_suggestions，native-history.js 与 history-values.mjs 提供目录和候选。历史值属于受权后台输入来源，不直接作为访客公开接口。

服务“测试连接”由 ServiceTools.current/test（service_tools.py）、service_config.py 和 install.service_test 发送受限样本；测试不保存配置、不生成业务条目。选择推荐配置、候选回填、图像裁剪和引用生成都先改变草稿，统一保存仍检查当前服务端版本。native-http.js 的 requestJSON、shared/http.js 与通知组件复用超时/取消/错误处理；写结果不确定时先重新读取，不能自动重复写入。

后台表头布局、显示列、选择范围、分批动作与取消使用 native-table-layout/native-table-headers/native-table-selection 及 native-list 模块，模板 native-list/native-list-panel 共享当前布局。列表推荐列在 column_layout 调整，字段类型/验证在原生契约和 catalog.normalize 调整；不要只在某一页加一个看起来可用但服务器不认识的字段。

## 20. 维护文档的方法

新增功能先更新本手册的用法和对应入口，再更新 SOURCE 的实际函数/模板记录；部署变量或恢复流程变化写入 OPERATIONS。不再每次发布复制一份历史功能说明、测试日志或结果 JSON 到 docs。测试结果放项目外或专用 CI 产物；reference 维持原设计资料，除非明确要求修改。未发布、未实机测试的项目不要写成已经完成的生产验证。
