# v0.15.128：第二步——轻量连接测试

## 已完成

“测试连接”只进行必要连接配置读取、HTTPS 请求、签名与时间检查、请求 nonce 核对、站点身份及协议/字段定义检查。对端 hello 不再调用 `core.revision()`，不读取业务记录，不创建同步任务，不查询媒体文件，也不写入快照。仍需数据库读取同步配置及提案接收开关，并非完全不依赖数据库。

新增只读 `inspect` 操作，复用同一签名接口、响应字段和验证方法，在需要时额外返回业务版本摘要。不新增 HTTP 路由、不重复实现认证，也不新建表。

下列原有业务检查仍保留，只改用 inspect：开始同步预览、预览完成后的校验、发送推送提案前校验、拉取执行前的检查。接收推送时仅核对发送者身份的反向请求继续使用轻量 hello。后台调度复用这些方法。

前台通过提示改为：

> 连接、签名、同步协议和站点身份检查通过；尚未读取或校验业务数据，开始预览时再检查。

这不是把数据错误当成功：如果业务读取失败，连接可通过，但开始预览会在 `data:check` / `peer:inspect` 等阶段报错，且不会创建可执行的删除预览。

## 部署要求

同步协议从 1 升至 2，并要求对端声明 data_check 能力。两站必须配套部署 v0.15.128 或后续兼容版本；一新一旧明确拒绝同步，不退回可能扫描全站的旧 hello。

1. 完整更新仓库文件及 `release-manifest.json`。
2. 更新 Ubuntu 与 Worker，刷新同步页面（静态脚本版本已更新）。
3. 两边分别测试连接，然后开始一次预览，核对第一步诊断中的阶段与错误类型。

数据库表和初始化 SQL 不变，无需重置，现有业务数据和连接配置保留。本版未实际连接生产站点，也未验证此前线上 D1 故障已经消除。预览分页中的全站重复扫描仍存在，第三步再处理；不要据轻量测试通过就判断全部同步功能已经正常。

## 修改路径

| 文件 | 修改 |
|---|---|
| `backend/app/native/site_sync.py` | 协议常量升为 2 |
| `backend/app/native/site_sync_admin.py` | hello 移除全站读取，inspect 复用响应与身份认证 |
| `backend/app/native/site_sync_tasks.py` | 复用 hello 方法的 with_revision 选项，校验能力、身份和摘要；预览使用数据检查 |
| `backend/app/native/site_sync_apply.py` | 执行前继续严格检查数据版本 |
| `backend/app/native/site_sync_proposals.py` | 发送前读取版本，接收身份核对保持轻量 |
| `backend/app/native/site_sync_transport.py` | 诊断识别 inspect 操作 |
| `frontend/admin/static/js/native-site-sync.js` | 准确区分连接通过与数据检查 |
| `frontend/admin/templates/native-site-sync.html` | 更新静态脚本版本 |
| `tests/test_sync_handshake_v128.py`（新增） | 双向轻量握手、业务失败隔离、协议和摘要校验 |
| `tests/test_site_sync_v120.py` | 测试对端同步到协议 2 |
| `tests/test_sync_deploy_v125.py` | 数据读取故障应发生在开始预览而非测试连接 |
| `tests/site-sync-dom.test.cjs` | 连接成功提示语义与单次请求验证 |
| `README.md`、`pyproject.toml`、`release-manifest.json` | 版本、说明与清单 |
| `docs/site-sync-handshake-v128.md`（新增） | 本文 |

## 下一步

第三步：版本读取分片化、减少分页重复扫描和统计；继续利用现有任务状态与快照，保留完整性校验及删除前的一致性保护。

验证：78 项后端/Worker 启动检查、12 项 DOM 界面检查通过；使用隔离数据库和模拟网络，不涉及生产数据。
