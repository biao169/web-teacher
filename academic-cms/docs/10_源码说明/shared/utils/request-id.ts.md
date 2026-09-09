# shared / utils / request-id.ts

## 文件定位

- **源码路径**：`shared/utils/request-id.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享模块；提供跨运行时复用的类型、工具或后台定义。
- **规模**：27 行，944 字节
- **内容校验**：SHA-256 `df559553d20bde061736d3438e59c9560bef36174498f4b506c63ffa509064f2`

## 直接调用方

- `server/middleware/00-request-context.ts`
- `server/utils/health.ts`
- `tests/unit/request-id.spec.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `normalizeRequestId` | 函数，第 3 行 | 规范化 Request Id，消除不安全或不一致的输入形式 | 由 `server/middleware/00-request-context.ts`、`server/utils/health.ts`、`tests/unit/request-id.spec.ts` 等模块导入使用。 |
| `selectRequestId` | 函数，第 15 行 | 读取或定位 Request Id，向调用方返回匹配结果 | 由 `server/middleware/00-request-context.ts`、`server/utils/health.ts`、`tests/unit/request-id.spec.ts` 等模块导入使用。 |

### 调用签名

- `normalizeRequestId`：`export function normalizeRequestId(value: string | null | undefined): string | null`
- `selectRequestId`：`export function selectRequestId(options: RequestIdOptions =`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `RequestIdOptions` | 接口，第 9 行 | 约束 Request Id Options 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
