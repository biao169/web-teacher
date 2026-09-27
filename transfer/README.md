# 有界传输升级：0.15.67

本地部署新增分块索引与接收确认窗口，须停服升级schema并保留transfer-data。使用说明及限制见 `../docs/features/transfer-bounded-v67.md`。

# 本地部署变更：0.15.66

Windows/Linux快传已并入主站，入口 `/transfer/`，不得再启动 `transfer.backend.vps`。使用主站数据库与会话，旧数据迁移及回滚见 `../docs/features/transfer-integration-v66.md`。以下独立服务说明仅保留为历史/Worker适配参考，不能用于当前本地部署。

# 独立文件快传 0.15.24

使用 Python、FastAPI、原生 JavaScript 和 Bootstrap；无前端编译。数据库直接使用原工具的12张表70个字段，文件按不超过1MiB的分块存储，单文件上限200MiB。

快传服务拥有独立数据库、缓存和文件地址。身份来自教师站签名短时票据，快传用自己的会话和 `admin_grants` 验证管理权限。它可以运行在另一台服务器或独立 Worker；当前身份入口需要教师站，不能沿用旧版快传独立用户名/密码登录。

## 本地运行

最方便的联合入口是项目根目录 `start-with-transfer.cmd`，自动初始化首次管理员授权并保存共享签名密钥；已有账号和数据保留。`reset-data.cmd` 只在显式切换旧库结构时使用。

独立运行复用项目 Python 环境；用 `TEACHER_CONFIG` 配置外部 TOML，或分别设置 `TRANSFER_DATABASE_PATH`、`TRANSFER_CACHE_DIR`、`TRANSFER_MEDIA_DIR`。另设 `TEACHER_ORIGIN`、`TRANSFER_ORIGIN` 和与教师站相同的 `TEACHER_TRANSFER_SECRET`。

```bash
python -m transfer.backend.cli init --grant-uid EXISTING-CMS-UID
python -m uvicorn transfer.backend.vps:app --host 127.0.0.1 --port 8004 --workers 1 --limit-concurrency 8
```

Linux 在项目根目录执行 `bash start-transfer.sh`；Windows 使用 `deploy/windows/start-transfer.cmd`。两个入口均启动整合后的教师网站，快传使用同一端口下的 `/transfer/`，首次空库交互创建网站管理员。完整配置与部署教程见项目根目录 README.md。

## Cloudflare 准备

```bash
python transfer/deploy/prepare_worker.py --origin https://transfer.example.com --teacher-origin https://teacher.example.com --database-id REAL-D1-UUID --bucket transfer-files --cache-bucket transfer-cache --grant-uid EXISTING-CMS-UID
```

生成 `.transfer-worker` 和用于空 D1 的 `initialize.sql`；支持自定义 D1/R2 绑定名与对象前缀。它不创建资源、不重置远程库、不发布。两侧均需配置同一桥接 Secret，主站需配置 `TEACHER_TRANSFER_URL`。额外管理员授权可用 `python -m transfer.deploy.admin_sql --uid CMS-UID --output 外部SQL路径` 生成 SQL。

## 功能边界

后台按最近时间分批显示全部任务，默认每批20条，可选50或100条，不设100条总上限。支持单条、所选和全部匹配范围的分批暂停、恢复、撤销及停止清理。独立缓存目录可扫描、删除和失败重试，清理后保留任务历史。断点上传要求用户重新选择同一文件，浏览器校验已上传前缀摘要。分享链接受任务有效期、下载次数、用户权限和原生身份规则限制。

保留原工具设置及数据库结构；当前执行临时分享，日/周/月全站及身份额度按授权预留和分块结算，取消释放未用部分；未实现P2P、VPN出口计量和所有原版工具设置。启用未接入的保护模式会明确拒绝相应传输。原始默认设置禁用服务和临时分享，需要后台明确启用。

当前验证为本地真实上传/下载及任务控制，不代表真实Windows、500MB VPS或Cloudflare部署实测。功能说明见 `docs/features/transfer.md`，代码用途见 `docs/code/functions.md`。

0.15.41提供用户/角色专属规则编辑、单文件与匿名接收控制、分享有效期/次数和管理员用量查询。说明见 `docs/features/transfer-step5.md`；原有数据库无需迁移，已有配置不会被初始化覆盖。
