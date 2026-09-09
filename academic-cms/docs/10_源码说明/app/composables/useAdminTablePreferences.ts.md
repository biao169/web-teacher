# app / composables / useAdminTablePreferences.ts

## 文件定位

- **源码路径**：`app/composables/useAdminTablePreferences.ts`
- **文件类型**：程序模块
- **功能定位**：Nuxt/Vue 组合式逻辑模块；集中管理可复用的数据请求、状态和页面行为。
- **规模**：66 行，2380 字节
- **内容校验**：SHA-256 `07b7533f2c3e1e2a40dbd013c2986481c2de6fa979cf7a4e17b949ae74286f15`

## 直接依赖

- `vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `safePreferenceKey` | 函数，第 12 行 | 封装 Preference Key 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizedWidths` | 函数，第 16 行 | 规范化 Widths，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `useAdminTablePreferences` | 函数，第 26 行 | 封装 Table Preferences 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `storageKey` | 内部函数，第 30 行 | 封装 Key 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `persist` | 内部函数，第 31 行 | 更新 persist，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `load` | 内部函数，第 36 行 | 加载并刷新 load，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `setColumnWidth` | 内部函数，第 51 行 | 更新 Column Width，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `columnWidth` | 内部函数，第 56 行 | 封装 Width 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `resetColumnWidths` | 内部函数，第 57 行 | 封装 Column Widths 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `safePreferenceKey`：`function safePreferenceKey(value: string): string`
- `normalizedWidths`：`function normalizedWidths(value: unknown): Record<string, number>`
- `useAdminTablePreferences`：`export function useAdminTablePreferences(preferenceKey: MaybeRefOrGetter<string>)`
- `storageKey`：`function storageKey(): string`
- `persist`：`function persist(): void`
- `load`：`function load(): void`
- `setColumnWidth`：`function setColumnWidth(column: string, width: number): void`
- `columnWidth`：`function columnWidth(column: string): number | undefined`
- `resetColumnWidths`：`function resetColumnWidths(): void`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `StoredColumnWidths` | 接口，第 3 行 | 约束 Stored Column Widths 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
