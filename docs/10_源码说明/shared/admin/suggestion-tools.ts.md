# shared / admin / suggestion-tools.ts

## 文件定位

- **源码路径**：`shared/admin/suggestion-tools.ts`
- **文件类型**：程序/脚本
- **功能定位**：历史输入建议的分词与替换；兼容中英文分号，仅替换当前未完成项并保留已完成分类。
- **规模**：30 行，1384 字节
- **内容校验**：SHA-256 `bfd5d58e44aa3ac2e0ee0ddccfbfcfa1770eb82b7096759464d58100719a2edf`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `normalizeAdminSuggestionKey` | 函数，第 1 行 | 规范化候选键以便比较与去重。 |
| `splitAdminSuggestionValue` | 函数，第 5 行 | 按多值模式拆分中英文分号并规范化候选，单值模式保留整体。 |
| `currentAdminSuggestionToken` | 函数，第 11 行 | 获取光标输入串末尾尚未完成的候选词。 |
| `completedAdminSuggestionTokens` | 函数，第 17 行 | 获取多值输入中已完成的分类，供保留和去重。 |
| `replaceCurrentAdminSuggestionToken` | 函数，第 23 行 | 选中候选后替换末尾词，并保留已完成分类。 |

### 调用签名

- `normalizeAdminSuggestionKey`：`export function normalizeAdminSuggestionKey(value: unknown): string`
- `splitAdminSuggestionValue`：`export function splitAdminSuggestionValue(value: unknown, multiple: boolean): string[]`
- `currentAdminSuggestionToken`：`export function currentAdminSuggestionToken(value: unknown, multiple: boolean): string`
- `completedAdminSuggestionTokens`：`export function completedAdminSuggestionTokens(value: unknown, multiple: boolean): string[]`
- `replaceCurrentAdminSuggestionToken`：`export function replaceCurrentAdminSuggestionToken(value: unknown, selected: unknown, multiple: boolean): string`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
