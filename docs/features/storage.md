# 跨平台存储配置

优先级：环境变量 > TEACHER_CONFIG指定的TOML配置 > 默认值。配置文件中的相对路径按配置文件所在目录解析。Windows/Linux可以分别设置数据库文件、缓存目录、媒体目录，支持不同目录或磁盘；数据地址必须在源码目录外。data_dir保存联合启动密钥，即使六个存储地址都单独设置，data_dir仍必须在源码外部。

| 用途 | TOML storage字段 | 环境变量 |
| --- | --- | --- |
| 默认数据根 | data_dir | TEACHER_DATA_DIR |
| 主站SQLite文件 | database_path | TEACHER_DATABASE_PATH |
| 主站缓存目录 | cache_dir | TEACHER_CACHE_DIR |
| 主站媒体目录 | media_dir | TEACHER_MEDIA_DIR |
| 快传SQLite文件 | transfer_database_path | TRANSFER_DATABASE_PATH |
| 快传缓存目录 | transfer_cache_dir | TRANSFER_CACHE_DIR |
| 快传文件目录 | transfer_media_dir | TRANSFER_MEDIA_DIR |
| 静态库来源 | asset_mode | TEACHER_ASSET_MODE：local/cdn |

数据库不能在可清理的缓存目录内，媒体与缓存不能重叠。修改地址后使用新位置，不自动搬动旧文件。Windows启动器、维护CLI和服务入口读取相同配置，脚本不覆盖用户的显式配置。日志位于主站cache_dir/logs，论文元数据成功缓存位于cache_dir/metadata/v2。快传缓存资源已独立接入，目前续传状态保存在原生recovery_tasks，不产生额外缓存表。

Cloudflare使用D1绑定和R2桶/前缀替代本地地址。实际数据库ID、桶名在准备工具生成的wrangler.json配置。

| 用途 | Worker变量 | 默认值 |
| --- | --- | --- |
| 主站数据库 | TEACHER_DATABASE_BINDING | DB |
| 主站媒体 | TEACHER_MEDIA_BINDING | MEDIA |
| 主站缓存 | TEACHER_CACHE_BINDING | MEDIA |
| 主站媒体前缀 | TEACHER_MEDIA_PREFIX | media/ |
| 主站缓存前缀 | TEACHER_CACHE_PREFIX | cache/ |
| 快传数据库 | TRANSFER_DATABASE_BINDING | TRANSFER_DB |
| 快传媒体 | TRANSFER_MEDIA_BINDING | TRANSFER_FILES |
| 快传缓存 | TRANSFER_CACHE_BINDING | TRANSFER_FILES |
| 快传媒体前缀 | TRANSFER_MEDIA_PREFIX | transfer/media/ |
| 快传缓存前缀 | TRANSFER_CACHE_PREFIX | transfer/cache/ |

prepare工具允许独立数据库绑定、媒体桶、缓存桶及前缀；缓存和媒体共桶时前缀不能重叠。生成的initialize.sql只适用于空D1；本地reset-data不操作远程D1或R2。R2桶保持私有，文件读取由应用检查引用和权限。

TEACHER_ORIGIN和TRANSFER_ORIGIN定义合法站点来源；TEACHER_TRANSFER_URL定义快传入口。两个服务用同一TEACHER_TRANSFER_SECRET验证短时身份票据；本地联合启动将随机密钥保存于data_dir/transfer-bridge.key，不存入可清理缓存。独立部署通过环境或平台Secret配置。


媒体目录核对仅列举配置的媒体根目录/R2媒体前缀，不扫描快传或缓存。报告及预检使用主站cache_dir或缓存绑定/前缀下的media-audit区域；报告只对所属账号可见，可分批清除。24小时为报告操作有效期，清除报告不删除媒体。持久清理待重试意图保存在既有admin_mutation_guards，清空缓存不影响失败清理恢复。

论文服务可选凭据读取 `TEACHER_OPENALEX_API_KEY`、`TEACHER_SEMANTIC_SCHOLAR_API_KEY`、`TEACHER_PUBMED_API_KEY`；本地配置到启动进程环境，Worker配置到同名Secret。可选 `TEACHER_METADATA_EMAIL` 仅发送到Crossref/PubMed作为服务联系邮箱。后台全局设置保存启用顺序和缓存时长，密钥不写入配置数组。详见[论文元数据服务](metadata-search.md)。


external媒体仅在现有数据库中登记URL、声明类型及使用位置，不写入本地/R2文件或缓存，也不调用目录head/delete。媒体大小0是原生占位，界面显示未知；权限入口按实际引用授权后重定向。裁剪成功后产生的副本则使用正常配置的媒体目录/R2前缀。


翻译服务的可选部署密钥为TEACHER_GOOGLE_TRANSLATE_KEY、TEACHER_DEEPL_API_KEY、TEACHER_MICROSOFT_TRANSLATOR_KEY和TEACHER_LIBRETRANSLATE_API_KEY，Worker使用同名Secret。部署值优先于原生数据库配置；自建LibreTranslate/Microsoft域名通过TEACHER_TRANSLATION_HOSTS逗号列表允许。翻译临时串行租约复用原生保护表，不增加新缓存目录或常驻服务；完整字段与边界见[翻译服务](translation-services.md)。
