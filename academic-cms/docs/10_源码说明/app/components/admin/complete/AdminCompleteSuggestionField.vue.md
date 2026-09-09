# app / components / admin / complete / AdminCompleteSuggestionField.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteSuggestionField.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。
- **规模**：92 行，3139 字节
- **内容校验**：SHA-256 `94897d5ac257ad31d4619dfd119f115759a3d474d628310cdc736db31af31f22`

## 直接依赖

- `element-plus`
- `~~/shared/admin/suggestion-tools`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `resolvedModule` | computed 派生状态，第 39 行 | 派生 resolved Module 的响应式状态，供模板和交互逻辑读取 |
| `lengthProps` | computed 派生状态，第 44 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `completedTokens` | 函数，第 46 行 | 文件内部的 `completedTokens` 实现；按下方完整调用签名传入参数，参与本文件“后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。”所述流程。 |
| `fetchSuggestions` | 函数，第 49 行 | 读取或定位 Suggestions，向调用方返回匹配结果 |
| `selectSuggestion` | 函数，第 70 行 | 读取或定位 Suggestion，向调用方返回匹配结果 |

### 调用签名

- `resolvedModule`：`resolvedModule = computed(() => {`
- `lengthProps`：`lengthProps = computed(() => props.maxLength > 0 ? { maxlength: props.maxLength } : {})`
- `completedTokens`：`function completedTokens(value: string): Set<string>`
- `fetchSuggestions`：`async function fetchSuggestions(query: string, callback: (items: SuggestionItem[]) => void)`
- `selectSuggestion`：`function selectSuggestion(item: Record<string, unknown>)`

## 模板接入

子组件：`ElAutocomplete`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
