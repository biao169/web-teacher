# server / services / i18n / translation-store.ts

## 文件定位

- **源码路径**：`server/services/i18n/translation-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：104 行，4928 字节
- **内容校验**：SHA-256 `1fbd8368a9735412761d2d045e4ab8ea2755b43d6d4c64104ac57c9bd6d7d9c5`

## 直接依赖

- `../../../db/contracts`
- `../../../db/query`
- `../../i18n/errors`
- `../../i18n/fingerprint`
- `../../i18n/source-ref`

## 直接调用方

- `server/services/i18n/translation-reader.ts`
- `server/utils/i18n-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `required` | 函数，第 22 行 | 检查 required 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `text` | 函数，第 26 行 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 10 次。 |
| `boolean` | 函数，第 31 行 | 封装 boolean 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `isoTimestamp` | 函数，第 36 行 | 检查 Timestamp 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `parseRecord` | 函数，第 42 行 | 解析 Record 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `TranslationStore.constructor` | 构造方法，第 65 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/i18n/translation-reader.ts`、`server/utils/i18n-runtime.ts` 等模块导入使用。 |
| `TranslationStore.currentBySourceRefs` | 类方法，第 67 行 | 封装 By Source Refs 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/i18n/translation-reader.ts`、`server/utils/i18n-runtime.ts` 等模块导入使用。 |

### 调用签名

- `required`：`function required(row: RawRow, name: string): string | number | null`
- `text`：`function text(row: RawRow, name: string): string`
- `boolean`：`function boolean(row: RawRow, name: string): boolean`
- `isoTimestamp`：`function isoTimestamp(value: string): string`
- `parseRecord`：`function parseRecord(row: RawRow): CurrentTranslationRecord`
- `TranslationStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `TranslationStore.currentBySourceRefs`：`async currentBySourceRefs(sourceRefKeys: readonly string[], targetLang: 'en' = 'en'): Promise<ReadonlyMap<string, CurrentTranslationRecord>>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CurrentTranslationRecord` | 接口，第 11 行 | 约束 Current Translation Record 的数据结构或可选值 |
| `TranslationStore` | 类，第 64 行 | 封装 Translation Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
