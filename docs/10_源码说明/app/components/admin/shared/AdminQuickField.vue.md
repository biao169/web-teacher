# app / components / admin / shared / AdminQuickField.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminQuickField.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台共享界面组件；统一列表、编辑器、操作按钮或字段控件的交互与样式。
- **规模**：84 行，4056 字节
- **内容校验**：SHA-256 `232f306a803e1dce21fb67f957e1e0046ecb3c7775348d6efc9787cdc7c487bf`

## 直接依赖

- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/unified-list`

## 直接调用方

- `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- `app/components/admin/complete/AdminCompleteResourceWorkspace.vue`
- `app/components/admin/content/List.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `sameValue` | 函数，第 16 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `booleanPair` | computed 声明，第 20 行 | 派生 boolean Pair 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `currentOption` | computed 声明，第 26 行 | 派生 current Option 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `currentBooleanOption` | computed 声明，第 27 行 | 派生 current Boolean Option 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `nextBooleanOption` | computed 声明，第 28 行 | 派生 next Boolean Option 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `booleanTone` | computed 声明，第 29 行 | 派生 boolean Tone 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `booleanLabel` | computed 声明，第 30 行 | 派生 boolean Label 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `booleanAriaLabel` | computed 声明，第 31 行 | 派生 boolean Aria Label 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `optionTone` | 函数，第 33 行 | 根据 Tone 返回对应的展示类型或颜色语义 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `toneForValue` | 函数，第 36 行 | 根据 For Value 返回对应的展示类型或颜色语义 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `toggleBoolean` | 函数，第 40 行 | 根据输入组装 Boolean 所需的结果对象或结构 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `sameValue`：`function sameValue(left: unknown, right: unknown): boolean`
- `booleanPair`：`booleanPair = computed(() =>`
- `currentOption`：`currentOption = computed(() => props.options.find(option => sameValue(option.value, props.modelValue)))`
- `currentBooleanOption`：`currentBooleanOption = computed(() => adminBooleanValue(props.modelValue) === true ? booleanPair.value?.enabled : booleanPair.value?.disabled)`
- `nextBooleanOption`：`nextBooleanOption = computed(() => adminBooleanValue(props.modelValue) === true ? booleanPair.value?.disabled : booleanPair.value?.enabled)`
- `booleanTone`：`booleanTone = computed<AdminOptionTone>(() => currentBooleanOption.value?.tone ?? adminOptionTone(props.modelValue, 'boolean') ?? 'info')`
- `booleanLabel`：`booleanLabel = computed(() => currentBooleanOption.value?.label ?? currentOption.value?.label ?? '未设置')`
- `booleanAriaLabel`：`booleanAriaLabel = computed(() => \`$`
- `optionTone`：`function optionTone(option: AdminListOption): AdminOptionTone | undefined`
- `toneForValue`：`function toneForValue(value: unknown): AdminOptionTone | undefined`
- `toggleBoolean`：`function toggleBoolean(): void`

## Vue 模板交互

- 模板约 38 行；样式区约 0 行。
- 子组件：`ElButton`、`ElSelect`、`ElOption`
- 事件绑定：`click → toggleBoolean`、`change → (value: unknown) => emit(`
- 动态属性：`class`、`type`、`plain`、`disabled`、`loading`、`aria-label`、`aria-pressed`、`model-value`、`data-tone`、`key`、`label`、`value`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
