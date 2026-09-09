# tests / unit / navigation-filter-tool.spec.ts

- **源码路径**：`tests/unit/navigation-filter-tool.spec.ts`

## 文件定位

- 源码路径：`tests/unit/navigation-filter-tool.spec.ts`
- 职责：实际 Element Plus 筛选弹窗的 4 项 DOM 交互回归。
- 规模：75 行，4474 字节
- SHA-256：`25253dea00f1ae13b49bdb728b0cd02f2246195489c6f5dd3341285050281fe8`

## 方法与用法

| 方法/数据 | 用途与调用规则 |
| --- | --- |
| `mount / input / settle` | 挂载组件、输入和等待响应，网络边界使用受控候选响应。 |
| `测试组` | 选择候选、双语预览、应用、重新打开恢复、取消、只读、候选失败和超长输入。 |

## 维护边界

筛选字段白名单和 ASCII 协议以 `shared/utils/public-list-link.ts` 为准。不要在每个页面复制编解码逻辑，不增加数据库列。集成说明见 `docs/17_筛选按钮与双语ASCII链接验收.md`。
