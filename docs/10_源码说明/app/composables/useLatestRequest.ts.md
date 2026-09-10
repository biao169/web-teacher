# app / composables / useLatestRequest.ts

## 文件定位

- **源码路径**：`app/composables/useLatestRequest.ts`
- **文件类型**：程序/脚本
- **功能定位**：提供独立的异步读取有效期；后一次请求、显式失效和组件卸载都会让旧响应失效。
- **规模**：14 行，462 字节
- **内容校验**：SHA-256 `2f7771f22d2556b9115504bf79017f184008e1ab4c1caed9be2c0bc06ace0513`

## 直接依赖

- `vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `useLatestRequest` | 函数，第 4 行 | 在 setup 中创建一个请求流；返回 start 和 invalidate，不与其他流共用版本。 |
| `invalidate` | 函数，第 7 行 | 使该流已生成的所有有效性谓词失效。 |
| `start` | 函数，第 8 行 | 开始新的读取版本，返回 isCurrent 谓词；必须在 await 后检查再写入状态。 |

### 调用签名

- `useLatestRequest`：`export function useLatestRequest()`
- `invalidate`：`function invalidate(): void`
- `start`：`function start(): () => boolean`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
