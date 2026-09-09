# server / utils / complete-admin / csv.ts

## 文件定位

- **源码路径**：`server/utils/complete-admin/csv.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：12 行，639 字节
- **内容校验**：SHA-256 `897a4556c3c09184ea7a48c86bd76a8edcf51230ea1e808688ab799ae25d27d0`

## 直接调用方

- `server/services/complete-admin/log-service.ts`
- `server/services/complete-admin/transfer-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `safeCsvCell` | 函数，第 1 行 | 封装 Csv Cell 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/complete-admin/log-service.ts`、`server/services/complete-admin/transfer-service.ts` 等模块导入使用。 |
| `serializeSafeCsv` | 函数，第 7 行 | 把 Safe Csv 转换为展示、传输或存储所需格式 | 由 `server/services/complete-admin/log-service.ts`、`server/services/complete-admin/transfer-service.ts` 等模块导入使用。 |

### 调用签名

- `safeCsvCell`：`export function safeCsvCell(value: unknown): string`
- `serializeSafeCsv`：`export function serializeSafeCsv(rows: readonly Record<string, unknown>[], keys?: readonly string[]): string`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
