# app / components / admin / complete / AdminCompleteMetadataWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteMetadataWorkspace.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。
- **规模**：115 行，5103 字节
- **内容校验**：SHA-256 `edbde26143b28eef549ccdbeb2a8f50f95e0874365e32de7a393f923452bc674`

## 直接依赖

- `../shared/AdminFormItem.vue`
- `element-plus`

## 直接调用方

- `app/pages/admin/patents/metadata/index.vue`
- `app/pages/admin/publications/metadata/index.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `placeholder` | computed 声明 | 派生 placeholder 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `title` | computed 声明 | 派生 title 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `rows` | computed 声明 | 派生 rows 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `lookup` | 函数 | 读取或定位 lookup，向调用方返回匹配结果 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `copyResult` | 函数 | 封装 Result 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `formatValue` | 函数 | 把 Value 转换为展示、传输或存储所需格式 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `placeholder`：`placeholder = computed(() => kind.value === 'doi' ? '例如：10.1145/1234567.1234568' : '例如：US12345678B2')`
- `title`：`title = computed(() => kind.value === 'doi' ? '论文 DOI 元数据' : '专利元数据')`
- `rows`：`rows = computed(() => result.value ? Object.entries(result.value).filter(([, value]) => value !== null && value !== undefined && value !== '') : [])`
- `lookup`：`async function lookup()`
- `copyResult`：`async function copyResult()`
- `formatValue`：`function formatValue(value: unknown): string`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MetadataKind` | 类型 | 约束 Metadata Kind 的数据结构或可选值 |

## Vue 模板交互

- 模板约 36 行；样式区约 12 行。
- 子组件：`ElSegmented`、`ElForm`、`AdminFormItem`、`ElInput`、`ElButton`、`ElAlert`、`ElEmpty`、`ElDescriptions`、`ElDescriptionsItem`
- 事件绑定：`click → lookup`、`click → copyResult`
- 动态属性：`options`、`label`、`placeholder`、`loading`、`title`、`closable`、`column`、`key`
- 局部样式选择器：`.complete-metadata-workspace`、`.workspace-header`、`.workspace-header h2`、`.workspace-header p`、`.workspace-eyebrow`、`.lookup-form`、`.lookup-form :deep(.el-form-item)`、`.metadata-result`、`.result-actions`、`@media (max-width: 640px)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 本轮字段统一

2026-09-06：本文件涉及的表单标题改为复用 `AdminFormItem`；控件和业务提交方法保持原有职责。批量编辑通过共享字段描述符和 `AdminFieldRenderer` 渲染。验收范围与待验项目见 `docs/15_后台统一字段标题与批量编辑验收.md`。
