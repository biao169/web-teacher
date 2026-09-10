# server / utils / public-locale.ts

## 文件定位

- **源码路径**：`server/utils/public-locale.ts`
- 功能：把 H3 请求的 Cookie、可信平台信息和客户端 IP 接入共享语言规则，不读取数据库或登录会话。
- 规模：27 行，1822 字节
- SHA-256：`dbc5d13b66c76165d3664d1d5148dd81ab74ee01d4db93866f7f229c85f6236e`

## 方法与用法

| 方法/数据 | 用途和使用方式 |
| --- | --- |
| `resolveVisitorLocale(event, config, lookup?)` | 手动 Cookie 可直接返回；Cloudflare 读取 Nitro 传入的 request.cf.country / context.cf.country；其他情况复用 selectClientNetwork，再调用地区查询。 |
| `lookupCountry` | 进程/Worker 实例内共用缓存；不把个人 IP 写入数据库或应用日志。 |

## 维护边界

详细配置和验收见 `docs/18_IP默认语言与手动偏好验收.md`。语言规则集中于共享工具，可信代理策略复用现有安全模块，不在各页面独立复制判定。
