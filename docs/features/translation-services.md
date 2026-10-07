# 翻译服务、预设和连接测试

翻译和论文检索在同一全局设置编辑页管理，共用服务卡片、启用复选项、顺序、默认值、参数说明和测试反馈。普通启动、页面加载和访客切换语言不调用外部翻译接口，也不写入推荐配置。

## 默认值与配置保留

| 配置状态 | 有效行为 |
| --- | --- |
| 全无翻译配置和密钥 | MyMemory作为默认、唯一启用通道，可明确尝试调用 |
| 已有Google密钥，但默认及启用列表为空 | 保留此前有效的Google通道；不静默切换供应商 |
| 已选择默认或保存启用列表 | 使用已有默认和有序列表；未勾选的服务不会自动恢复 |
| 列表为空、已选择默认 | 仅启用所选默认服务 |
| 全无论文服务配置 | 默认Crossref；推荐启用顺序为Crossref、DataCite、Europe PMC、PubMed |
| 手动填入推荐设置 | 只修改当前组的默认及启用顺序草稿；保留密钥、自建地址、邮箱、区域和其他设置，统一保存后生效 |

原生字段仍是global_settings.translation_provider、translation_providers及既有各服务参数。列表保存不重复的服务标识数组，至少启用一个服务；默认须在启用列表中。翻译顺序为1–5，论文顺序为1–6；相同顺序按当前卡片排列处理。读取时解析有效默认值，不修改DDL、增加兼容表或在启动时重写配置。

全局服务使用最早创建的一条设置。另一条配置可以编辑和测试，但不会自动取代当前生效记录。保存继续检查配置权限、CSRF与原生updated_at；填写错误时草稿保留。

## 翻译供应商

| 服务 | 地址及参数 | 凭据与说明 |
| --- | --- | --- |
| MyMemory | https://api.mymemory.translated.net/get；q、langpair、mt，可选de | 不预设共享密钥；mymemory_email仅作为可选联系邮箱，不读取登录账号邮箱 |
| Google Translate | https://translation.googleapis.com/language/translate/v2；文本、明确源/目标语言、format=text | google_translate_api_key；请求头X-Goog-Api-Key，不放入URL |
| DeepL | Pro为https://api.deepl.com/v2/translate，Free为https://api-free.deepl.com/v2/translate | deepl_api_key；有效密钥以:fx结尾时选择Free地址，Authorization使用DeepL-Auth-Key |
| Microsoft Translator | 默认https://api.cognitive.microsofttranslator.com；添加translate、api-version=3.0及源/目标语言 | microsoft_translator_key；区域按实际资源填写，全球单服务资源可留空，不自动猜测 |
| LibreTranslate | 默认https://libretranslate.com；添加translate，发送q、源/目标语言和format=text | 官方托管需要libretranslate_api_key；自建实例按自己的认证要求配置 |

MyMemory每个请求的q最多500个UTF-8字节，字节限制与中文字数不同；仅调用查询接口，不调用贡献译文或上传翻译记忆接口。外部服务的额度及可用性由其控制，不承诺永久免密钥或无限使用。[MyMemory接口规格](https://mymemory.translated.net/doc/spec.php)

Google使用官方Basic v2文本接口；需要有效API凭据。DeepL的Free与Pro端点不同，通过密钥后缀选择，密钥仅用于服务端。[Google接口](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate)、[DeepL认证](https://developers.deepl.com/docs/getting-started/auth)

Microsoft区域与资源类型有关；托管LibreTranslate和自建实例的认证规则也可能不同，预设地址不会产生真实密钥。[Microsoft认证](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication)、[LibreTranslate接口](https://docs.libretranslate.com/api/operations/translate/)

## 密钥与自建地址

后端优先读取部署环境中的对应值；环境没有设置时使用数据库中既有服务密钥。密钥输入留空保留原值，界面只显示是否配置，响应不回显密钥。翻译密钥最多4096个不含空白的ASCII字符；其他保留服务密钥仍遵循原有8192字符规则。配置数组不能夹带密钥或供应商对象。

| 服务 | 本地环境变量／Worker同名Secret |
| --- | --- |
| Google | TEACHER_GOOGLE_TRANSLATE_KEY |
| DeepL | TEACHER_DEEPL_API_KEY |
| Microsoft | TEACHER_MICROSOFT_TRANSLATOR_KEY |
| LibreTranslate | TEACHER_LIBRETRANSLATE_API_KEY |

libretranslate_url和microsoft_translator_endpoint允许HTTPS自建根地址或适用基础路径；不得包含账号密码、查询参数、锚点、内网字面IP或非标准端口。自建域名还须由部署变量TEACHER_TRANSLATION_HOSTS明确允许，例如 `translator.example.org,translator2.example.org`。这一变量只允许对应自建服务，不允许将Google、DeepL或MyMemory凭据改发到另一站点。

服务器不跟随重定向；官方固定服务具有精确地址与路径限制。允许的自建主机属于部署者信任配置：程序不固定DNS解析结果，也不为受信域名的DNS变动提供隔离保证；需由部署者维护其域名和网络访问边界。页面中只填一个地址不能直接启用任意目标。

## 连接测试

每个服务有独立“测试连接”按钮。测试使用当前组草稿和已有密钥，仅向明确选择且勾选的服务发送短样例：翻译为“你好，世界。”→en，论文查询为machine learning。测试不会使用教师资料、论文正文或整个表单其他字段，不保存设置、论文、译文或候选缓存。

状态区区分成功、未启用、缺少配置、认证拒绝、限流/额度、超时及无效返回。论文返回合法空候选可判为连接成功，同时明确“样例未返回候选”，不表示检索找到了论文。地址详情显示打开页面时的有效地址；修改参数后测试结果立即标为需要重新测试，晚返回的旧结果不能认证新草稿。

连接测试需要对应全局设置编辑／新增权限，已有配置必须持有当前版本；等待外部响应后再次检查版本与权限。只有明确点击才发送请求，测试成功不代表以后请求一定成功，也不代表凭据有无限额度。

## 单条翻译与结果保护

内容页的按钮根据已保存标题／名称建立翻译条目，不立即联网。已有相同来源标识、摘要和目标语言时复用条目。单条来源与批量扫描共用11类公开内容的明确字段注册表；具体范围及调度见[翻译批次管理](translation-batch.md)。

翻译条目显示源/目标语言、已有状态和来源，可选择默认服务、某个已启用服务，或明确选择“按配置回退”。默认调用不会在失败后把原文自动发送给另一供应商；显式回退按启用顺序逐家尝试，完整成功后停止，不拼接不同供应商的半成品。

有未保存编辑时先保存或恢复草稿，避免跳转丢失内容；执行期间字段和保存按钮暂时锁定，失败后恢复。已保存的人工译文明确锁定，不自动覆盖。

服务端先检查翻译与原文查看权限、当前源文本/摘要、译文版本及人工标记。写入事务再次核对权限、原文更新时间、媒体引用及服务租约。原文更新、删除、人工修改、权限撤销或版本冲突后，晚到结果不能覆盖现有数据。

全部成功才写入原生translated_text、实际provider、success、is_current、is_manual和updated_at，替换同一来源/目标的旧当前译文。失败不保存半截正文：尚未成功的条目记录failed及固定错误说明，已有成功译文保持原样。不会将供应商错误正文、密钥或完整原文写入操作日志。

## 文本、富文本与资源上限

- 普通文本保留换行及URL；新闻HTML先复用原清理器，再只翻译文字节点。标签、媒体UID、链接地址和pre/code内容保持原样，供应商返回的HTML作为文本转义。
- Markdown来源按普通文本发送供应商，译文仍按Markdown安全呈现并核验媒体；供应商可能改变Markdown标点，须人工校对，不承诺语法无损。
- 每次原文最多60000个UTF-8字节；MyMemory每段500字节，其余服务每段4000字节。优先按换行、句子或空白分段；超过限制明确拒绝，不静默截断。
- 单条入口最多20个不同片段／20次实际请求，回退共同消耗请求额度。新合批入口按原生数组或完整分隔标记合并片段，每步最多20次请求；具体装箱及中断处理见翻译批次管理。新建、单条和批次共用跨记录复用，要求来源仍公开、可查看且原文与语言/格式相同；有效人工译文优先，人工差异须明确核对。
- translation_timeout_seconds是本条请求总等待预算，1–120秒；每次HTTP最多12秒。单响应最多1MiB，输出最多200000字符，所有片段串行处理。
- 同类翻译和翻译连接测试使用现有admin_mutation_guards中的全站短租约，避免两个页面同时跑MyMemory。没有常驻翻译进程；异常退出残留租约180秒后可重新领取。
- Worker请求可主动中止；本地线程在等待超时后仍可能进行短暂底层网络收尾。因此等待预算不等于包括DNS及底层收尾的绝对墙钟时限。

批次管理使用既有translation_batch_size、translation_worker_count和translation_job_state，支持扫描、单批、连续运行、暂停和失败重试；实际单并发，不启动后台进程。本功能不修改前台模板、数据库/缓存/媒体路径或正常启动的数据保留规则，不增加生产依赖或编译流程。
