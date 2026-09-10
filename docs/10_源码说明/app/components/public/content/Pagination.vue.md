# app / components / public / content / Pagination.vue

- **源码路径**：`app/components/public/content/Pagination.vue`

## 文件定位

- 源码路径：`app/components/public/content/Pagination.vue`
- 职责：共用分页导航，保留全部搜索、筛选、语言及锚点。
- 规模：34 行，2194 字节
- SHA-256：`9c0a7490582d0207dc5609bda574c7222b57c64b6b88c748d54c237eb327175f`

## 方法与用法

| 方法/数据 | 用途与调用规则 |
| --- | --- |
| `pageTarget(page)` | 通过 publicListHref 仅修改 page；第一页省略 page 参数。 |
| `pages` | 计算首尾及当前页附近页码；维持原有分页窗口和省略号。 |

## 维护边界

筛选字段白名单和 ASCII 协议以 `shared/utils/public-list-link.ts` 为准。不要在每个页面复制编解码逻辑，不增加数据库列。集成说明见 `docs/17_筛选按钮与双语ASCII链接验收.md`。
