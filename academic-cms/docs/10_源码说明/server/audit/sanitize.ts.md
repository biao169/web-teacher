# server / audit / sanitize.ts

## 文件定位

- **源码路径**：`server/audit/sanitize.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：92 行，4313 字节
- **内容校验**：SHA-256 `d30138f8fbb13923815ae5659d88a9b4be677d0a8f1652b3d0899c4df425ca99`

## 直接依赖

- `../../db/schema-types`
- `../security/errors`

## 直接调用方

- `server/audit/commands.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `sensitiveKey` | 函数，第 9 行 | 封装 Key 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `oneLine` | 函数，第 20 行 | 响应 Line 相关事件，协调后续业务流程 | 由 `server/audit/commands.ts` 等模块导入使用。 |
| `sanitizeAuditDetail` | 函数，第 29 行 | Copies data properties only. Getters, prototypes and symbol keys are never executed or serialized. | 由 `server/audit/commands.ts` 等模块导入使用。 |
| `visit` | 函数变量，第 32 行 | 封装 visit 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `assertSafeAuditEvent` | 函数，第 88 行 | 检查 Safe Audit Event 是否满足业务、安全或类型约束 | 由 `server/audit/commands.ts` 等模块导入使用。 |

### 调用签名

- `sensitiveKey`：`function sensitiveKey(value: string): boolean`
- `oneLine`：`export function oneLine(value: unknown, maximum = 500): string | null`
- `sanitizeAuditDetail`：`export function sanitizeAuditDetail(value: unknown): JsonValue`
- `visit`：`visit = (current: unknown, depth: number, key = ''): JsonValue =>`
- `assertSafeAuditEvent`：`export function assertSafeAuditEvent(value: JsonValue): void`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
