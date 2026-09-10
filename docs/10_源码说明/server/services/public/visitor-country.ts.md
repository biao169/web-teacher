# server / services / public / visitor-country.ts

## 文件定位

- **源码路径**：`server/services/public/visitor-country.ts`
- 功能：可供 Node 与 Worker 使用的 IP 规范化和有界 Country 查询服务，不新增依赖或 IP 数据库。
- 规模：95 行，4977 字节
- SHA-256：`6030ccecd8dfc19febcac8da0c06adaef06697bb5ee323fcc14a5468331caf15`

## 方法与用法

| 方法/数据 | 用途和使用方式 |
| --- | --- |
| `normalizeVisitorIp(input)` | 验证 IPv4、使用 URL 内建解析器验证 IPv6，并统一 IPv4 映射地址；拒绝主机名、端口、区域标记、注入字符和歧义 IPv4。 |
| `publicVisitorIp(input)` | 排除本机、私网、共享地址、链路本地、文档及保留地址；只有公网候选才允许发送查询。 |
| `lookupBase(value)` | 读取默认或指定接口地址，拒绝凭据、查询和锚点；远程仅 HTTPS，显式配置的本机自建服务可用 HTTP。 |
| `createVisitorCountryLookup(fetcher?, clock?)` | 创建最多 512 条缓存的查询函数。同一 IP 合并请求，成功缓存 6 小时、失败缓存 60 秒；最多 4 个在途和每秒 8 次新请求；429 按数字 Retry-After 暂停，最多 900 秒；无有效数字时暂停 60 秒。 |
| `返回的 lookup(input, options?)` | 可关闭外部查询，支持运行时地址和 200–3000 毫秒超时。响应复用 parseBoundedJsonStream，最多 4096 字节，核对返回 IP 后采用地区；错误返回 null，交给语言策略降级。 |

## 维护边界

详细配置和验收见 `docs/18_IP默认语言与手动偏好验收.md`。语言规则集中于共享工具，可信代理策略复用现有安全模块，不在各页面独立复制判定。
