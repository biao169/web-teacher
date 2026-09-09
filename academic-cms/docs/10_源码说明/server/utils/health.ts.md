# server / utils / health.ts

## 文件定位

- **源码路径**：`server/utils/health.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：55 行，1654 字节
- **内容校验**：SHA-256 `da364a2211482e7ad19f2b84a96e9bd2a38569be957a82171c5bc7b1eecdd18d`

## 直接依赖

- `../../shared/contracts/health`
- `../../shared/utils/request-id`

## 直接调用方

- `server/routes/health.get.ts`
- `tests/unit/health.spec.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `normalizeRuntimeKind` | 函数，第 19 行 | 规范化 Runtime Kind，消除不安全或不一致的输入形式 | 由 `server/routes/health.get.ts`、`tests/unit/health.spec.ts` 等模块导入使用。 |
| `normalizeHealthVersion` | 函数，第 23 行 | 规范化 Health Version，消除不安全或不一致的输入形式 | 由 `server/routes/health.get.ts`、`tests/unit/health.spec.ts` 等模块导入使用。 |
| `toIsoTimestamp` | 函数，第 32 行 | 根据输入组装 Iso Timestamp 所需的结果对象或结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `createHealthPayload` | 函数，第 39 行 | 创建 Health Payload，并完成初始化或持久化处理 | 由 `server/routes/health.get.ts`、`tests/unit/health.spec.ts` 等模块导入使用。 |

### 调用签名

- `normalizeRuntimeKind`：`export function normalizeRuntimeKind(value: unknown): RuntimeKind`
- `normalizeHealthVersion`：`export function normalizeHealthVersion(value: unknown): string`
- `toIsoTimestamp`：`function toIsoTimestamp(value: Date): string`
- `createHealthPayload`：`export function createHealthPayload(options: CreateHealthPayloadOptions): HealthPayload`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CreateHealthPayloadOptions` | 接口，第 12 行 | 约束 Create Health Payload Options 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
