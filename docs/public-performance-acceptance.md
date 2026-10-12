# Public 缓存验收（v0.16.117）

## 本地可验证

- HTML GET/HEAD/304成功标记、ETag；含Cookie仍为匿名；标准页面 browser max-age=1800；无query的公开固定导航入口 browser max-age=60、edge max-age=120、SWR=30、SIE=300。
- PublicData16个固定URL、完整且有界、禁止私有字段、GET/HEAD/304语义。
- 400/404/500/503及未标记200模板 no-store，无成功标记、ETag或Cache-Tag污染。
- Router模拟HIT/STALE不构建应用、不访问D1/R2；模拟不证明平台实际命中或故障回退。
- 筛选/排序/分页复用一份模型；模型失败保留现有HTML并恢复渐进回退。
- 身份503/timeout/abort保留旧成功显示；明确false才改为登录；真实私有API实时拒绝撤销权限。
- tag通知只在提交后；拒绝、异常、超时不全站purge，不重放写操作。
- inline/separate源码staging、官方Wrangler四配置dry-run、辅助产物目标与私有绑定检查。

固定导航专属检查：仅GET/HEAD、合法slug、无query、无分片且已验证公开固定范围的成功HTML可缓存；未知入口、受限入口、详情、query、错误及未验证200均no-store。公开入口带Cookie也渲染匿名视图且不查询auth_sessions。导航条件/路径、名称、开关或可见性变化purge旧导航tag；标签文字修改invalidate。内容模块tag同时覆盖标准HTML、固定导航HTML和PublicData，模块维护无需新入口。仅受限入口匿名404且原请求带真实会话Cookie时，Router转给现有动态鉴权一次；5xx/timeout不走此分支、不purge。

新增固定导航的本轮源码测试与staging见v0.16.116发布记录；Wrangler dry-run和真实平台结果须按对应版本区分，不能用历史结果代替当前发布验收。

固定入口浏览器筛选（v0.16.117）：只输出匿名公开范围的最小JSON条件，复用原16个PublicData URL；原始eq/字面contains先限定范围，再叠加访客条件。模型完整、字段和能力声明均匹配才替换SSR。缺字段、旧声明、超限/不完整、失败或unsupported条件均保留服务器页面；模型失败恢复原有分片/分页。详情、复制引文、简介等按需接口继续携带nav/nv并实时验证。直接带query的公开固定列表也匿名显示、支持本地处理，但HTML no-store；受限入口始终服务端。公开模型筛选本身不发数据请求，私有组件或用户主动读取详情/引用仍可调用实时鉴权接口。旧页面中的固定范围是显示快照，不构成后台权限，也不承诺管理员修改后立即撤回已加载页面。

## 真实部署后验证

1. 使用现有发布流程，cloud-check核对main/Admin/Native/Executor版本、绑定和私有入口。保留原站点资源及同步拓扑。
2. 同一PoP访问标准HTML、固定公开导航HTML与固定PublicData多次；结合平台缓存诊断及Tail确认HIT无D1/渲染执行，记录CPU。不得只用响应耗时认定HIT。
3. 标准列表与固定入口重复筛选/排序/分页，Network确认公开列表不重复读取模块数据；检查筛选始终与固定范围求交、分类选项限定范围、详情/语言/返回/重置保持入口及版本。关闭JS或拒绝模型时验证原服务器回退。私有组件和显式详情/引文请求仍实时鉴权，不包含在公开筛选零请求结论中。
4. 在测试环境预热成功对象并过新鲜期，再注入刷新5xx/timeout；检查返回旧成功HTML/JSON。实际1101/1102需测试环境故障与平台日志，不能用普通Python异常代替CPU限制错误。无旧成功对象的MISS无法回退。
5. 恢复后验证新成功内容替换；故障期间没有purge或扫描；5xx未成为新缓存对象。不要在生产主动制造CPU耗尽。
6. 普通修改提交后验证相关tag重新验证，撤回/删除及时移除；检查其他模块不误失效。验收跨PoP行为及通知pending恢复。浏览器新鲜缓存和已加载模型不受边缘tag失效控制。
7. 阻断session-summary后页面可用、旧身份显示保留；明确退出后显示登录，后台写操作仍实时鉴权。
8. Admin/Auth/Sync/private API、自由query及写请求不共享缓存，登录/退出及CSRF无缓存泄漏。
9. 在测试站修改固定导航条件、重命名、关闭或改为登录专属，确认旧tag purge、旧匿名HTML不再从边缘返回；登录专属入口仍实时鉴权。检查同一模块正常修改invalidate，手动模块purge同时影响固定HTML及PublicData；不得预热或循环清缓存。边缘失效并非浏览器即时撤回，浏览器最多保留其新鲜60秒；RPC pending/传播延迟时不能保证立即撤回旧对象，按现有诊断处理。

只读HTTP探针：`python -B tests/probe_public_performance.py --origin https://你的站点 --expected-release 0.16.117 --output public-http.json`。不登录、不写入、不触发故障；Public缓存响应可能没有release诊断头，不能据此认定线上版本。以cloud-check的平台版本为准。Cloudflare可能消费移除 CDN cache-control / Cache-Tag；不要要求它们一定在客户端可见。

平台 stale-if-error行为依据：https://developers.cloudflare.com/workers/cache/configuration/ 。平台负责保留和返回可用旧对象；缓存可驱逐、不同PoP可能未预热，不承诺故障时所有页面均可用。避免附加s-maxage/must-revalidate/proxy-revalidate禁用该回退语义。

重要边界：stale-if-error作用于可缓存entrypoint的已有成功对象及刷新失败。若Default Router在转发前就被平台终止，或请求到达从未预热的PoP，则不能保证走到PublicPage/PublicData的旧对象。浏览器也不能保证在所有错误码下自动返回过期对象。本设计没有Service Worker或独立外部故障网关；本轮不新增Recovery层。

当前代码验收补充：动态卡片图标共用模板，匿名Header立即显示登录，旧身份查询失败保留；右侧工具宽度和移动布局需真实浏览器复核。模块维护须同时收到Page/Data接受，home只Page；异常/超时为unknown，部分拒绝为failed，不重试。purge后重新生成仍500时查request_id错误栈，停止反复清理。

2026-10-12匿名HTTP观察到当前站点200/HIT，PublicData304；所返回HTML仍引用旧资源并含身份等待文字。本次读取不证明109–113已发布，也不提供D1计数或CPU证明，详见最新发布记录。
