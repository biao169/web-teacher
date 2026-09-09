# tests / unit / navigation-filter-service.spec.ts

- **源码路径**：`tests/unit/navigation-filter-service.spec.ts`

## 文件定位

- 源码路径：`tests/unit/navigation-filter-service.spec.ts`
- 职责：完整迁移后的真实 SQLite 与实际后台资源服务的 6 项回归。
- 规模：90 行，6502 字节
- SHA-256：`fcbe5633bc8bce8be2c55edb65f9ea35dd47cbdcf2108ba7af047b1af6de3000`

## 方法与用法

| 方法/数据 | 用途与调用规则 |
| --- | --- |
| `迁移与适配器夹具` | 只使用内存数据库，运行生产迁移；前台使用 SqliteAdapter 与 PublicContentStore。 |
| `测试组` | 保存和重读按钮、实际中文筛选、15 条记录分页、隐藏记录隔离、更新冲突、日志及缓存版本、非法链接无部分写入。 |

## 维护边界

筛选字段白名单和 ASCII 协议以 `shared/utils/public-list-link.ts` 为准。不要在每个页面复制编解码逻辑，不增加数据库列。集成说明见 `docs/17_筛选按钮与双语ASCII链接验收.md`。
