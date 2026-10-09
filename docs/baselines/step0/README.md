# Step 0：双平台架构基线（基于 v0.16.049）

本交付为 `v0.16.049-step0-baseline`，运行时代码版本仍为 0.16.049。仅新增测试、采样工具和本报告，未提前执行后台轻量化、首页懒加载或多 Worker 拆分。已有生产文件与 v0.16.049 逐文件 SHA-256 比较，结果见 `source-integrity.json`。

## 已固定的结构与行为

- Ubuntu/Debian：真实 VPS 入口使用临时 SQLite runtime，验证一次 local()、一次 create_app()、一次 install_local()；同一 FastAPI 实例，不挂载第二个完整 FastAPI。
- 实际执行 startup/shutdown，验证唯一同步 task 创建和结束。tick 被测试替身阻塞，避免本测试执行真实同步；同步业务由既有同步回归覆盖。
- 实际调用部署 render，验证默认与多实例名称、不同端口、多域名仍各生成一个 systemd 服务、一个 upstream 目标。
- systemd 预算保持 MemoryHigh=160M、MemoryMax=224M、TasksMax=32。
- 实际调用服务启动器、拦截 uvicorn.run，验证 workers=1、单监听端口、默认并发16；配置校验覆盖8/32合法与越界拒绝。
- 真实 Uvicorn/SQLite/HTTP 的已有 Linux 测试覆盖安装后的启动、升级、重启、数据保留、健康检查及卸载；systemd、账号与 Git 操作使用测试替身，不操作当前宿主或真实 VPS。
- 普通前台、后台、媒体和同步页面请求不调用 host.tick。
- 复用 Worker 主入口首次访问/登录、separate 转发、独立 executor、Sync Native、本地 workerd/D1/R2 和实际 staging 打包检查；没有修改这些组件。
- 公共流加载 DOM 测试覆盖串行队列、重复触发、失败恢复、离页取消；同步 DOM 测试覆盖轻量摘要、详情故障隔离与60秒刷新。

## 请求开销基线

`platform/baseline.json` 由可重复采样脚本生成，包含每个请求的 SQL 次数、返回行数、表名、listing调用、媒体引用汇总次数、完整应用路由表、lazy应用路由表和独立解释器导入清单。不保存凭据、Cookie、SQL参数或业务正文。

样本：临时 SQLite，list_fixture 中各适用业务模块3条记录、一张合成 PNG，最高管理员及匿名请求；不是大数据压测。

| 路径 | 首次 SQL 查询数 | 重复 SQL 查询数 | 观察 |
|---|---:|---:|---|
| `/en` | 12 | 2 | 默认配置调用 profiles/publications/projects/news listing；重复请求命中本地公开读取缓存 |
| `/admin` | 40 | 40 | 每次调用18次完整 listing，仅为显示统计卡片 |
| `/admin/media_assets` | 20 | 20 | 只有一张媒体，也调用一次引用汇总 |
| `/admin/site-sync` | 5 | 5 | 本项仅页面HTML，不包含浏览器后续API请求 |

查询计数是数据库 query 方法调用次数，不含fixture初始化，不等价于 SQLite内部语句数量或 D1计费行数。报告中的耗时为本地 ASGI 请求墙钟时间，不能当作 Cloudflare CPU、浏览器TTFB或真实 Ubuntu生产性能。首页学生/专利在此默认样本未启用，不能据此声称所有首页配置只查询四个模块。

路由和导入清单记录**当前行为**，尚未生成未来 Public/Admin 的正式归属表。LazySyncRoutes 不是普通 FastAPI Route，清单保留其类型和空 path；动态路由行为另由既有集成测试覆盖，不能将空 path 当作漏路由。

## 复现

在已安装项目测试依赖、Node.js、jsdom、Miniflare 的环境运行：

```bash
python tests/acceptance_platform_baseline.py --output /tmp/teacher-step0-platform
python tests/acceptance_media_sync.py --output /tmp/teacher-step0-sync
```

两个输出目录必须不存在。非默认依赖位置可通过 PYTHONPATH、NODE_PATH/JSDOM_PATH、MINIFLARE_MODULE 指定。脚本不安装依赖、不上线、不读取生产凭据。缺少依赖应报告失败；显式跳过 workerd 的结果为 partial，不能写成通过。

## 本步修改文件

- `tests/test_platform_baseline_step0.py`：11项部署结构与应用生命周期基线。
- `tests/capture_platform_baseline.py`：临时数据库请求开销、路由及导入采样。
- `tests/acceptance_platform_baseline.py`：补充回归入口与阶段报告。
- `docs/baselines/step0/`：说明、测试证据、源文件一致性报告。
- `release-manifest.json`：只追加基线文件与交付标识，不改运行时版本。

SQL、业务HTTP路径、Python生产导入、认证、文件快传、媒体、同步业务均未变化；仍保留唯一初始化SQL。Cloudflare当前仍是主网站+独立Executor+Native，未提前增加Admin Worker。Ubuntu仍保持一个服务。

## 验证边界与下一步

尚未验证真实 Cloudflare CPU/outcome、不同PoP、Python Worker SDK线上运行、真实Ubuntu/Debian systemd/Caddy资源使用、浏览器视觉效果与线上并发。离页取消的DOM测试不能证明服务端计算被终止。

下一步 Step 1：后台首页移除为计数调用 listing 的路径，新增单个 dashboard-counts 请求，统计复用权限范围；卡片先显示占位。以本步18次listing/40次查询为对照，验证首屏不再读取列表数据，同时保持Linux单服务和同步单循环。

## 本次结果

- 新增结构测试11项通过（包含在平台回归133项中）；最后增加的单App断言再次单独执行11项通过。
- Linux及共享页面/认证/媒体/快传/部署回归：133 passed。
- 既有同步与Cloudflare Python回归：817 passed、47 subtests passed、1 skipped。
- JavaScript同步模块：64 passed。
- 首页流加载与同步页面DOM：28 passed。
- 本地workerd/D1/R2：6 passed。
- 实际PACKAGE后的inline/separate staging、主站与executor启动/延迟依赖检查通过。
- 当前采样完整应用108个路由项，lazy应用90个路由项，独立解释器应用构建后62个项目模块导入。两种路由清单的差异包含静态挂载及LazySyncRoutes，数量差异不代表接口缺失。
- 警告为现有FastAPI on_event/Starlette弃用提示；本步不为消除警告改动生产生命周期。
