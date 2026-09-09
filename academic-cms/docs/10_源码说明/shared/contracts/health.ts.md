# shared / contracts / health.ts

## 文件定位

- **源码路径**：`shared/contracts/health.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享契约；定义请求、响应及领域数据的 TypeScript 类型。
- **规模**：18 行，487 字节
- **内容校验**：SHA-256 `50347f8a04b0773dd8b6a92c454689e0cd0884b501950c71b19e8c1d50c40e43`

## 直接调用方

- `server/utils/health.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `isRuntimeKind` | 函数，第 15 行 | 检查 Runtime Kind 是否满足业务、安全或类型约束 | 由 `server/utils/health.ts` 等模块导入使用。 |

### 调用签名

- `isRuntimeKind`：`export function isRuntimeKind(value: unknown): value is RuntimeKind`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `HEALTH_STATUS` | 导出常量，第 1 行 | 提供 HEALTH STATUS 的共享配置或不可变数据 |
| `HEALTH_SERVICE` | 导出常量，第 2 行 | 提供 HEALTH SERVICE 的共享配置或不可变数据 |
| `RuntimeKind` | 类型，第 4 行 | 约束 Runtime Kind 的数据结构或可选值 |
| `HealthPayload` | 接口，第 6 行 | 约束 Health Payload 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
