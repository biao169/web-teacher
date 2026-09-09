# tests / unit / translation-batching.spec.ts

## 文件定位

- **源码路径**：`tests/unit/translation-batching.spec.ts`
- **文件类型**：测试模块
- **功能定位**：回归检查：同表译文合批、分隔标记校验和失败降级。
- **规模**：31 行，1830 字节
- **内容校验**：SHA-256 `39470d7eed9994432e7158f1a0bb720b2143f074eaa99efc8c1d2cf1cb66f521`

## 直接依赖

- `vitest`
- `../../server/services/complete-admin/translation-service`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `row` | 函数变量，第 4 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |

### 调用签名

- `row`：`row = (table: string, text: string) => …`

## 验证内容

- keeps different source tables in separate requests and observes item limits
- splits requests before their combined character budget is exceeded
- round-trips a delimiter envelope without confusing content line breaks
- rejects a provider response that loses a delimiter

运行：`pnpm exec vitest run tests/unit/translation-batching.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
