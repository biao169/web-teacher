# Public 缓存验收（v0.16.108）

## 本地可验证

- HTML GET/HEAD/304成功标记、ETag；含Cookie仍为匿名；固定页面 browser max-age=1800。
- PublicData16个固定URL、完整且有界、禁止私有字段、GET/HEAD/304语义。
- 400/404/500/503及未标记200模板 no-store，无成功标记、ETag或Cache-Tag污染。
- Router模拟HIT/STALE不构建应用、不访问D1/R2；模拟不证明平台实际命中或故障回退。
- 筛选/排序/分页复用一份模型；模型失败保留现有HTML并恢复渐进回退。
- 身份503/timeout/abort保留旧成功显示；明确false才改为登录；真实私有API实时拒绝撤销权限。
- tag通知只在提交后；拒绝、异常、超时不全站purge，不重放写操作。
- inline/separate源码staging、官方Wrangler四配置dry-run、辅助产物目标与私有绑定检查。

## 真实部署后验证

1. 使用现有发布流程，cloud-check核对main/Admin/Native/Executor版本、绑定和私有入口。保留原站点资源及同步拓扑。
2. 同一PoP访问标准HTML与固定PublicData多次；结合平台缓存诊断及Tail确认HIT无D1/渲染执行，记录CPU。不得只用响应耗时认定HIT。
3. 浏览器重复筛选/排序/分页，Network确认不重复访问数据库接口；关闭JS或拒绝模型时验证服务器回退。
4. 在测试环境预热成功对象并过新鲜期，再注入刷新5xx/timeout；检查返回旧成功HTML/JSON。实际1101/1102需测试环境故障与平台日志，不能用普通Python异常代替CPU限制错误。无旧成功对象的MISS无法回退。
5. 恢复后验证新成功内容替换；故障期间没有purge或扫描；5xx未成为新缓存对象。不要在生产主动制造CPU耗尽。
6. 普通修改提交后验证相关tag重新验证，撤回/删除及时移除；检查其他模块不误失效。验收跨PoP行为及通知pending恢复。浏览器新鲜缓存和已加载模型不受边缘tag失效控制。
7. 阻断session-summary后页面可用、旧身份显示保留；明确退出后显示登录，后台写操作仍实时鉴权。
8. Admin/Auth/Sync/private API、自由query及写请求不共享缓存，登录/退出及CSRF无缓存泄漏。

只读HTTP探针：`python -B tests/probe_public_performance.py --origin https://你的站点 --expected-release 0.16.108 --output public-http.json`。不登录、不写入、不触发故障；Public缓存响应可能没有release诊断头，不能据此认定线上版本。以cloud-check的平台版本为准。Cloudflare可能消费移除 CDN cache-control / Cache-Tag；不要要求它们一定在客户端可见。

平台 stale-if-error行为依据：https://developers.cloudflare.com/workers/cache/configuration/ 。平台负责保留和返回可用旧对象；缓存可驱逐、不同PoP可能未预热，不承诺故障时所有页面均可用。避免附加s-maxage/must-revalidate/proxy-revalidate禁用该回退语义。

重要边界：stale-if-error作用于可缓存entrypoint的已有成功对象及刷新失败。若Default Router在转发前就被平台终止，或请求到达从未预热的PoP，则不能保证走到PublicPage/PublicData的旧对象。浏览器也不能保证在所有错误码下自动返回过期对象。本设计没有Service Worker或独立外部故障网关；本轮不新增Recovery层。
