# app / components / admin / shared / AdminFieldRenderer.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminFieldRenderer.vue`
- **文件类型**：Vue 组件
- **功能定位**：项目支持文件；按所在目录承担配置、数据或运行支持职责。
- **规模**：178 行，7013 字节
- **内容校验**：SHA-256 `c7b56b5f3d62bd9b85fb7145e0ed57f06d59bcbb01190c27fb7a436490fb799e`

## 直接依赖

- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/editor-fields`
- `../complete/AdminCompleteMediaPicker.vue`
- `../complete/AdminCompleteRelationPicker.vue`
- `../complete/AdminCompleteSuggestionField.vue`
- `./AdminMediaPreview.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `update` | 函数，第 31 行 | 文件内部的 `update` 实现；按下方完整调用签名传入参数，参与本文件“项目支持文件；按所在目录承担配置、数据或运行支持职责。”所述流程。 |
| `textValue` | computed 派生状态，第 38 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `inputType` | computed 派生状态，第 39 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `suggestionIdentity` | computed 派生状态，第 40 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `numberProps` | computed 派生状态，第 45 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `lengthProps` | computed 派生状态，第 50 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `textareaRows` | computed 派生状态，第 51 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |

### 调用签名

- `update`：`function update(value: unknown): void`
- `textValue`：`textValue = computed(() => typeof props.modelValue === 'string' || typeof props.modelValue === 'number' ? String(props.modelValue) : '')`
- `inputType`：`inputType = computed(() => props.descriptor.baseControl === 'email' ? 'email' : props.descriptor.baseControl === 'url' ? 'url' : 'text')`
- `suggestionIdentity`：`suggestionIdentity = computed(() => {`
- `numberProps`：`numberProps = computed(() => ({`
- `lengthProps`：`lengthProps = computed(() => props.descriptor.maxLength === undefined ? {} : { maxlength: props.descriptor.maxLength })`
- `textareaRows`：`textareaRows = computed(() => props.compact ? 3 : (props.descriptor.rows ?? 5))`

## 模板接入

子组件：`AdminCompleteMediaPicker`、`AdminCompleteRelationPicker`、`AdminCompleteSuggestionField`、`AdminMediaPreview`、`ElDatePicker`、`ElInput`、`ElInputNumber`、`ElOption`、`ElSelect`、`ElSwitch`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
