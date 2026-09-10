# server / i18n / source-ref.ts

## 文件定位

- **源码路径**：`server/i18n/source-ref.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：51 行，2526 字节
- **内容校验**：SHA-256 `d218241553df6bb5a6328735f4b0d97622770aef17d1b533614649a7cf204d1c`

## 直接依赖

- `./errors`

## 直接调用方

- `db/seeds/sample-data.ts`
- `server/services/complete-admin/translation-service.ts`
- `server/services/i18n/translation-reader.ts`
- `server/services/i18n/translation-store.ts`
- `server/services/public/public-localization.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `validatePart` | 函数，第 9 行 | 检查 Part 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `buildSourceRefKey` | 函数，第 21 行 | 根据输入组装 Source Ref Key 所需的结果对象或结构 | 由 `db/seeds/sample-data.ts`、`server/services/complete-admin/translation-service.ts`、`server/services/i18n/translation-reader.ts` 等模块导入使用。 |
| `parseSourceRefKey` | 函数，第 32 行 | 解析 Source Ref Key 的输入格式，并输出受约束的数据结构 | 由 `db/seeds/sample-data.ts`、`server/services/complete-admin/translation-service.ts`、`server/services/i18n/translation-reader.ts` 等模块导入使用。 |

### 调用签名

- `validatePart`：`function validatePart(value: string, name: string, pattern?: RegExp): string`
- `buildSourceRefKey`：`export function buildSourceRefKey(reference: SourceReference): string`
- `parseSourceRefKey`：`export function parseSourceRefKey(key: string): SourceReference`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SourceReference` | 接口，第 15 行 | 约束 Source Reference 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
