# Cloudflare 部署累计修改清单

基准：原始 teacher-site-windows-v0.15.119.zip。结果：cloudflare-domain-step4（基于 cloudflare-r2-step3）。以下路径均相对项目根目录 teacher-site/。

共 38 个 deploy 内文件：新增 34 个，修改 4 个。打包另自动更新根目录 release-manifest.json。

| 路径 | 变更 |
| --- | --- |
| `deploy/cloudflare/ACCEPTANCE.md` | 新增 |
| `deploy/cloudflare/CHANGES.md` | 新增 |
| `deploy/cloudflare/DOMAINS.md` | 新增 |
| `deploy/cloudflare/domains.py` | 新增 |
| `deploy/cloudflare/tests/test_domains.py` | 新增 |
| `deploy/cloudflare/README.md` | 修改 |
| `deploy/cloudflare/build.py` | 新增 |
| `deploy/cloudflare/d1_setup.py` | 新增 |
| `deploy/cloudflare/r2_check.py` | 新增 |
| `deploy/cloudflare/integration_package.py` | 新增 |
| `deploy/cloudflare/package-lock.json` | 新增 |
| `deploy/cloudflare/package.json` | 新增 |
| `deploy/cloudflare/pipeline.py` | 新增 |
| `deploy/cloudflare/prepare.py` | 修改 |
| `deploy/cloudflare/pylock.toml` | 新增 |
| `deploy/cloudflare/pyproject.toml` | 修改 |
| `deploy/cloudflare/runtime/__init__.py` | 新增 |
| `deploy/cloudflare/runtime/bridge.py` | 新增 |
| `deploy/cloudflare/runtime/cleanup.py` | 新增 |
| `deploy/cloudflare/runtime/entrypoint.py` | 新增 |
| `deploy/cloudflare/runtime/routing.py` | 新增 |
| `deploy/cloudflare/runtime/setup.py` | 新增 |
| `deploy/cloudflare/runtime/storage-status.js` | 新增 |
| `deploy/cloudflare/runtime/transfer.py` | 新增 |
| `deploy/cloudflare/smoke.py` | 新增 |
| `deploy/cloudflare/tests/ffi_probe.py` | 新增 |
| `deploy/cloudflare/tests/native_bindings.cjs` | 新增 |
| `deploy/cloudflare/tests/native_bindings.py` | 新增 |
| `deploy/cloudflare/tests/test_acceptance_step5.py` | 新增 |
| `deploy/cloudflare/tests/test_build_step1.py` | 新增 |
| `deploy/cloudflare/tests/test_build_without_sqlite.py` | 新增 |
| `deploy/cloudflare/tests/test_d1_setup.py` | 新增 |
| `deploy/cloudflare/tests/test_r2_check.py` | 新增 |
| `deploy/cloudflare/tests/test_pipeline_step2.py` | 新增 |
| `deploy/cloudflare/tests/test_runtime_step3.py` | 新增 |
| `deploy/cloudflare/tests/test_transfer_step4.py` | 新增 |
| `deploy/cloudflare/uv.lock` | 新增 |
| `deploy/shared/worker_package.py` | 修改 |

## 步骤范围

1. 构建预检：build.py、README 和第一步测试。
2. 临时打包：pipeline、依赖/工具锁文件及 deploy/shared/worker_package.py。
3. 主站适配：runtime 绑定转换、Worker 入口、一次性初始化及测试。
4. 同站快传：资源打包、协调器路由、R2 存储状态、Cron 清理及测试。
5. 验收收尾：发布前完整性门禁、smoke.py、本地真实 D1/R2 探针、主站/媒体验收、ACCEPTANCE.md 和本清单。

README、build.py、pipeline.py 等跨步骤更新，表格按最终文件去重统计。

未修改 backend/、frontend/、transfer/ 的业务源码，未修改 database/schema.sql、根目录 pyproject.toml 或 README.md。没有永久 src 副本；部署时只在系统临时目录整理。
deploy/cloudflare/admin_sql.py 沿用原文件，不计入修改。

第五步不表示云端验收全部通过；完整运行限制和待验收项见 ACCEPTANCE.md。

## 本次第一步修复（相对 cloudflare-step5）

- deploy/shared/worker_package.py：直接读取安装 SQL；延迟加载可选迁移计划；保留共享 helper 旧默认行为。
- deploy/cloudflare/prepare.py：正常 Workers 打包默认不生成旧迁移计划。
- deploy/cloudflare/build.py：补丁标识 cloudflare-sqlite-fix1。
- deploy/cloudflare/tests/test_build_without_sqlite.py：新增缺少 SQLite 的回归测试。
- deploy/cloudflare/README.md、ACCEPTANCE.md、CHANGES.md：更新使用说明与验证范围。

## D1 修复第二步（相对 sqlite-fix1）

新增 `deploy/cloudflare/d1_setup.py`、`deploy/cloudflare/tests/test_d1_setup.py`；修改同目录 `pipeline.py`、`build.py`、`tests/test_pipeline_step2.py`、`README.md`、`ACCEPTANCE.md`、`CHANGES.md`。仅 deploy 内 8 个文件，另由发布工具刷新根目录 release-manifest.json。数据库/schema.sql、业务源码、表结构、依赖锁均不变。

自动初始化只针对空库；已有库保守核对对象定义。bundle 仅验证本地结构，deploy 才访问远程 D1。

## R2 第三步（相对 cloudflare-d1-step2）

新增 `deploy/cloudflare/r2_check.py` 和 `deploy/cloudflare/tests/test_r2_check.py`；修改同目录 `pipeline.py`、`build.py`、`tests/test_pipeline_step2.py`、`README.md`、`ACCEPTANCE.md`、`CHANGES.md`。共 8 个 deploy 文件，打包自动刷新根目录 release-manifest.json。业务源码、数据库结构、依赖锁不变。

## 域名第四步（相对 cloudflare-r2-step3）

新增 `deploy/cloudflare/domains.py`、`DOMAINS.md`、`tests/test_domains.py`；修改 `pipeline.py`、`build.py`、`README.md`、`ACCEPTANCE.md`、`CHANGES.md`。共 8 个 deploy 文件。打包另刷新 release-manifest.json。主站认证/SEO/业务代码、数据库和依赖锁不变。
