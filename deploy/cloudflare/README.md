# Cloudflare 原生结构部署包

主站和快传分别使用 Python Worker、独立 D1 数据库和可配置的 R2 媒体/缓存绑定。打包只复制 Python、HTML、CSS、JavaScript 和最终 SQL，不编译前端，不创建云端资源或执行远程 SQL。

主站准备命令：

```bash
python deploy/cloudflare/prepare.py --database-id REAL-D1-UUID --database-name teacher-site --bucket teacher-media --cache-bucket teacher-cache --origin https://teacher.example.com
```

命令生成 `.worker`。可用 `--database-binding`、`--media-binding`、`--cache-binding` 自定义绑定名，用 `--media-prefix`、`--cache-prefix` 自定义对象前缀。不指定缓存桶时默认与媒体共用桶，前缀必须分离。完整字段见 `docs/features/storage.md`。

`initialize.sql` 只用于空D1；主站内容由唯一的 `database/schema.sql` 生成。0.15.74起不再打包多份迁移SQL，改为 `migration-plan.json` 列出已知旧结构对应的DDL语句。它是供核对的计划，不会自动操作远程D1。已有D1必须先停写、备份、核对结构，再通过官方D1执行工具逐条执行匹配前置版本的语句并核验结果。包含旧快传parts数据时还需要Python数据转换，不能仅执行DDL；本地 `backend.cli migrate` 不直接连接远程D1。旧独立快传Worker仅保留兼容输出，其初始化DDL由历史结构快照生成；正式Windows/Linux部署使用整合主库。生成资源不等于迁移或部署；本版未操作真实Cloudflare。

`python deploy/cloudflare/admin_sql.py --output /安全的外部目录/admin.sql` 在本地交互生成原生管理员 SQL，并显示管理员 UID。文件包含密码摘要，不进入交付包；应用到已经初始化的主站 D1。快传准备及授权使用此 UID，见 `transfer/README.md`。

生成的 `wrangler.json` 可供核对真实域名、数据库 ID、桶名和绑定。主站变量 `TEACHER_TRANSFER_URL` 指向独立快传域名，两个 Worker 的 `TEACHER_TRANSFER_SECRET` 需通过平台 Secret 配置相同随机值。不要把密钥写进公开源码。

准备目录提供 Python Workers 依赖声明；部署机需使用目标平台支持的工具解析和锁定 SDK。VPS 不需要安装这套云端开发工具。当前只完成本地打包、模板与 SQL 验证，尚未在真实 Workers 环境验证 ASGI、D1 原子回滚、Web Crypto、R2 二进制桥接和平台资源限额，不能据此宣称云端生产验收通过。

论文元数据可选Secret为 `TEACHER_OPENALEX_API_KEY`、`TEACHER_SEMANTIC_SCHOLAR_API_KEY`、`TEACHER_PUBMED_API_KEY`；可选服务联系邮箱变量为 `TEACHER_METADATA_EMAIL`。由平台配置到生成的主站Worker，不写入服务数组或交付包。查询与回退规则见 `docs/features/metadata-search.md`。
