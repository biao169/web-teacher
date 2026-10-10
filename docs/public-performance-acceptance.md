# 公共页面性能验收

先部署相同源码到 Ubuntu 与 Cloudflare；检查 Worker 响应中的 `x-teacher-release` 与部署版本一致。没有版本头的 Ubuntu 需在服务器核对 current/pyproject.toml。不同版本的线上结果不能当作新版验收。

## 重复执行

在已安装项目依赖的环境中，从源码根目录执行：

```bash
python tests/benchmark_public_navigation.py > local-navigation.json
python tests/probe_public_performance.py --origin https://biao.nebastars.com --origin https://vip.moglider.com --expected-release 0.16.062 --output live-navigation.json
```

第一条使用临时 SQLite 示例数据及 TestClient，比较关闭缓存、整页命中、ETag 条件请求；不是公网 TTFB。第二条只发匿名 GET，每站最多6次、单次超时15秒、正文读取上限512KiB；不跟随重定向、不自动重试、不记录正文或 Cookie。它是数据采集器，执行成功不等于验收通过，应检查 release_match、HTTP 状态、ETag 与缓存头。`headers_ms` 包含连接、TLS及到达响应头的时间，不等于服务端 CPU。

## 真实环境待验收

- 两端均为目标版本；未登录首页、团队及项目列表200，重复请求命中 Render Cache；相同 ETag 条件请求304、正文0字节。
- 浏览器 DevTools Network 保持缓存启用，悬停/聚焦导航后再点击；验证文档请求复用缓存，并检查预取最多配置并发数。DOM模拟不能证明浏览器HTTP缓存复用。
- 分别以匿名和登录用户测试，确认身份相关页面不被匿名整页缓存；后台、同步、表单、错误响应继续 no-store。
- 在测试站修改一条公开内容，确认 revision/ETag 改变，重新验证时返回新正文；仍新鲜的浏览器缓存允许保留到原 TTL。不要为验收修改生产内容。
- 分别设整页 TTL=0、两种 TTL=0、预取并发=0，重启/部署后核对对应功能关闭；恢复默认1800/300/2/1。
- Cloudflare 按 request ID/Ray ID 查看对应 Public Worker invocation 的 CPU、outcome 与错误；记录样本数、版本、colo和时间，不把端到端耗时当CPU。没有平台数据时资源指标标记未测，不推断内存占用。
- Ubuntu 在相同负载下记录服务进程RSS、CPU和TTFB，区分冷启动、首次MISS和热HIT。基准脚本峰值RSS包含整个测试进程，不代表部署内存上限。

线上验收通过应同时满足业务正确、身份隔离和错误率没有退化，再比较同网络同版本的性能。不要用跨网络单次数字或旧版本错误决定修改新缓存逻辑。
