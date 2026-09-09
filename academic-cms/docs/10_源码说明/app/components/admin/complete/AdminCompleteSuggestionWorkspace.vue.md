# app / components / admin / complete / AdminCompleteSuggestionWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteSuggestionWorkspace.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。
- **规模**：102 行，5244 字节
- **内容校验**：SHA-256 `8edddaf4e2295f98d1c3ed8c8d7b0116133fb36d2c7adb18c50104b7885d47e9`

## 直接依赖

- `element-plus`
- `~/admin/element-plus-ts6`

## 直接调用方

- `app/pages/admin/translation/suggestions/index.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `availableFields` | computed 声明，第 30 行 | 派生 available Fields 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `search` | 函数，第 37 行 | 按条件查询或整理 search，返回可消费的结果集 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `copy` | 函数，第 58 行 | 封装 copy 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `availableFields`：`availableFields = computed(() => fields[module.value] ?? [])`
- `search`：`async function search()`
- `copy`：`async function copy(value: string)`

## Vue 模板交互

- 模板约 29 行；样式区约 8 行。
- 子组件：`ElForm`、`ElSelect`、`ElOption`、`ElInput`、`ElButton`、`ElAlert`、`ElEmpty`、`ElTable`、`ElTableColumn`
- 事件绑定：`click → search`、`click → copy(scope.row.value)`
- 动态属性：`key`、`label`、`value`、`loading`、`title`、`closable`、`data`
- 局部样式选择器：`.suggestion-workspace`、`.suggestion-workspace header p`、`.suggestion-workspace header h2`、`.suggestion-workspace header span`、`.suggestion-filters`、`@media (max-width: 800px)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
