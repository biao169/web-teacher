# app / components / admin / content / BatchDialog.vue

## 文件定位

- **源码路径**：`app/components/admin/content/BatchDialog.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台界面组件；构成后台导航、标题栏、状态反馈或内容管理交互。
- **规模**：59 行，3386 字节
- **内容校验**：SHA-256 `a88cfb3ecfc24c1feb0b5d061d09fb6482ca0f0f2fc28464d7714a2410e52e47`

## 直接依赖

- `../shared/AdminFormItem.vue`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~~/shared/contracts/admin-content`
- `~~/shared/admin/content-modules`
- `~/admin/content-utils`
- `~/admin/editor-fields`
- `../shared/AdminFieldRenderer.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `fields` | computed 声明 | 派生 fields 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `activeField` | computed 声明 | 派生 active Field 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `close` | 函数 | 关闭 close 对应的界面或恢复前一状态 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `submit` | 函数 | 封装 submit 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `fields`：`fields = computed(() => props.definition.batchFields .map(name => props.definition.fields.find(field => field.name === name)) .filter((field): field is AdminFieldDefinition => Boo…`
- `activeField`：`activeField = computed(() => fields.value.find(field => field.name === selectedField.value) ?? null)`
- `close`：`function close(): void`
- `submit`：`function submit(): void`

## Vue 模板交互

- 模板约 21 行；样式区约 0 行。
- 子组件：`ElDialog`、`ElAlert`、`ElForm`、`AdminFormItem`、`ElSelect`、`ElOption`、`AdminFieldRenderer`、`ElButton`
- 事件绑定：`close → close`、`click → close`、`click → submit`
- 动态属性：`model-value`、`close-on-click-modal`、`closable`、`title`、`key`、`label`、`value`、`field`、`disabled`、`loading`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 本轮字段统一

2026-09-06：本文件涉及的表单标题改为复用 `AdminFormItem`；控件和业务提交方法保持原有职责。批量编辑通过共享字段描述符和 `AdminFieldRenderer` 渲染。验收范围与待验项目见 `docs/15_后台统一字段标题与批量编辑验收.md`。

## 共享描述符

`descriptor` 从 `activeField` 及 `definition.module` 调用 `contentEditorFieldDescriptor` 生成。所选字段变化仍由 `defaultFieldValue` 初始化值；`submit()` 发出 `{ field, value }`，父层负责服务端提交。输入控件使用 `AdminFieldRenderer` 的 compact 模式，帮助文案来自 descriptor.help；提交期间字段选择与输入均禁用。
