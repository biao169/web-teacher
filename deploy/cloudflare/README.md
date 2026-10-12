# Cloudflare 部署：v0.16.113

当前 Public 缓存策略以本文及 [验收清单](../../docs/public-performance-acceptance.md) 为准。历史版本说明在 `docs/releases/`，其中 simple/full/off、Linux LRU、SQL 缓存、revision 分片缓存和 Public 预取配置不再适用。

## 策略

Default Router 缓存关闭；只有静态白名单 Public GET/HEAD 转发 PublicPage/PublicData。Public HTML 永远匿名，与 Cookie 无关；浏览器缓存1800秒。公开 Read Model 为16个固定 JSON URL，浏览器缓存300秒，边缘缓存1800秒。二者成功响应的边缘策略均为 `public, max-age=1800, stale-while-revalidate=300, stale-if-error=86400`。

只有明确成功标记的200结果产生共享缓存，合法304用于验证已有成功内容。错误、未标记200模板、带 Set-Cookie、自由 query、私有接口、Admin/Auth/Sync及写请求均 no-store。Python 不调用 Cache API，不缓存 SQL，不保存备用页面，不定时扫描缓存。

正常公开写入提交后按 Cache-Tag invalidate；撤回公开内容、删除或明确错误内容按依赖 tag purge。通知失败保留提交成功响应并记录 pending，不升级为全站 purge，不重试数据库写入。普通故障不主动删除成功缓存。

PublicData HIT 不进入 D1；HTML HIT 不进入 FastAPI/D1/Jinja。HTML MISS 保持原有渲染路径。列表用一次公开 Read Model 完成本地筛选、排序和分页；失败退回原 HTML/服务器渐进查询。身份显示先复用 sessionStorage 中五字段快照，约300秒才后台核验；失败静默且不切成未登录。真正私有操作继续实时鉴权。

## 已有站点发布

Cloudflare Builds 根目录保持 `deploy/cloudflare`，Build command 为 `python build.py check`，Deploy command 为 `python build.py deploy`。这些命令会执行云端检查；deploy 会实际发布。不要把离线 staging 或 Wrangler --dry-run 当作发布。

沿用当前站点的 `CLOUDFLARE_ACCOUNT_ID`、`TEACHER_WORKER_NAME`、`TEACHER_ORIGIN`、`TEACHER_D1_ID`、`TEACHER_D1_NAME`、`TEACHER_MEDIA_BUCKET`。发布认证使用现有 Cloudflare 发布令牌，辅助 Worker 创建/更新使用构建 Secret `TEACHER_AUX_API_TOKEN`。不要在源码或运行时公开辅助令牌。`TEACHER_SYNC_EXECUTOR_MODE=separate` 沿用现有拓扑；Admin、Native、Executor 私有入口和 Sync 协议不变。

`TEACHER_ALLOWED_ORIGINS`、`TEACHER_CUSTOM_DOMAINS`、`TEACHER_CACHE_BUCKET`、D1初始化及外部服务 Secrets 沿用既有设置，本轮无新必填变量和数据库迁移。旧 Public cache TTL/mode/request-cache/prefetch 环境变量已由统一策略忽略并从生成配置剔除，不需要用它们调节本轮缓存。

`python build.py cloud-check` 可只读核对线上版本、绑定和调度配置；它需要现有站点配置与相应令牌，不代替业务验收。`python build.py verify-companions` 检查辅助 multipart 产物而不发布。

## 离线验证

从项目根目录运行 `python -B tests/stage_release_v016001.py` 及带 `--separate-sync` 的同一命令。可加 `--output` 保存到项目外全新目录。随后使用官方 Wrangler 4.143.0 对生成的 main/admin/executor/native 配置逐一 deploy --dry-run；必须安装与锁文件一致的 Python Worker SDK依赖。产物不是生产部署。

本轮实际打包与回归结果、失败诊断和线上待验收项见 [最新故障与部署验收](../../docs/releases/v0.16.113.md)。本轮未发布；本轮只读HTTP已观察到当前站点的200/HIT及Data304；缺少发布和日志凭据，未验证新版本发布、1101/1102旧内容回退、跨PoP tag失效或Worker CPU。

Ubuntu/Debian仍为原单服务部署；不会获得 Cloudflare 共享 Workers Cache。浏览器公共成功缓存策略一致，本轮不引入本地 LRU 或预取层。

本轮main/Admin/Executor预演未压缩上传约12397.9KiB，gzip约3072.6KiB；Native42.87KiB/gzip11.83KiB。预演不证明真实账号接受上传限额，也不验证Python Worker启动CPU/内存；发布前应以目标账号平台检查为准。不要将打包通过等同于1102风险已消除。

## 模块缓存维护

系统管理员进入后台运行维护的公开缓存区，确认异常后只清理一个白名单模块。main经原SITE_ADMIN鉴权响应，分别调用Page/Data所属entrypoint；首页Data不适用，单服务不执行共享边缘清理。accepted只表示平台接受，未知或部分失败需查日志，不自动重试或预热。不能清除浏览器新鲜缓存，不能修复页面生成500。

HTTP500未处理异常现提供X-Request-ID和X-Teacher-Error-Code: REQUEST_FAILED；同一request_id记录在错误栈日志。该关联只在异常处理器运行时有效，不覆盖平台1101/1102硬终止。PublicData仍按原503/错误code诊断，身份失败保持静默。

截至2026-10-12官方limits文档，Worker包限制为未压缩64MiB，gzip仅供参考；不要继续用历史压缩3MiB限制判断此包。来源：https://developers.cloudflare.com/workers/platform/limits/ 。实际CPU、启动时间与账号配置仍需平台确认。
