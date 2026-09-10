# shared / utils / public-locale.ts

## 文件定位

- **源码路径**：`shared/utils/public-locale.ts`
- 功能：前后端共享的默认语言规则、地区默认值和手动偏好 Cookie 选项。
- 规模：38 行，2257 字节
- SHA-256：`fa65d9ae7dcaab18a86f2e1a0866b8cd2c3a581e022c1eee9ecfceba9ce9b044`

## 方法与用法

| 方法/数据 | 用途和使用方式 |
| --- | --- |
| `PUBLIC_LOCALE_DEFAULTS` | 默认中文地区 CN/HK/MO/TW、未知情况最终英文、默认 Country 查询地址和 1000 毫秒超时；nuxt.config.ts 读取同一份默认值。 |
| `PUBLIC_LOCALE_COOKIE / PUBLIC_LOCALE_COOKIE_OPTIONS` | 仅保存 zh/en 手动选择，期限 365 天、Path=/、SameSite=Lax；HTTPS 页头启用 Secure。不会记录自动判定的猜测。 |
| `savedPublicLocale(value)` | 只接受严格的 zh/en；坏 Cookie 不阻止访问，继续后续判断。 |
| `publicCountryCode(value)` | 将地区代码规范为两位大写；XX、ZZ、T1 等未知值不当作可用地区。 |
| `browserPublicLocale(header)` | 读取有界的 Accept-Language，按有效 q 权重和原顺序选择 zh/en；忽略 q=0、未知语言和格式错误。 |
| `defaultPublicLocale(input)` | 手动偏好优先，随后地区，地区未知时浏览器语言，最后配置的 fallback/en；有效非中文地区返回英文。 |

## 维护边界

详细配置和验收见 `docs/18_IP默认语言与手动偏好验收.md`。语言规则集中于共享工具，可信代理策略复用现有安全模块，不在各页面独立复制判定。
