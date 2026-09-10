# app / components / admin / complete / AdminCompleteRelationPicker.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteRelationPicker.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。
- **规模**：57 行，3111 字节
- **内容校验**：SHA-256 `4fd3279534e84bf13334e2472d9612dc9f6785ca965a14252e7dd4f2151c0550`

## 直接依赖

- `element-plus`

## 直接调用方

- `app/components/admin/complete/AdminCompleteRecordEditor.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `label` | 函数，第 13 行 | 返回 label 对应的界面显示文本 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `load` | 函数，第 17 行 | 加载并刷新 load，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `choose` | 函数，第 25 行 | 封装 choose 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `label`：`function label(row: any): string`
- `load`：`async function load()`
- `choose`：`function choose(row: any)`

## Vue 模板交互

- 模板约 24 行；样式区约 3 行。
- 子组件：`ElInput`、`ElButton`、`ElDialog`、`ElAlert`、`ElTable`、`ElTableColumn`、`ElEmpty`
- 事件绑定：`update:model-value → emit(`、`clear → emit(`、`click → open=true`、`click → load`、`click → choose(row)`
- 动态属性：`model-value`、`readonly`、`disabled`、`loading`、`title`、`closable`、`data`、`description`
- 局部样式选择器：`.admin-relation-toolbar`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
