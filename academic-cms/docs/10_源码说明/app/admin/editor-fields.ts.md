# app / admin / editor-fields.ts

## 文件定位

- **源码路径**：`app/admin/editor-fields.ts`
- **文件类型**：程序/脚本
- **功能定位**：将 content 与 complete 两套服务端字段描述适配为同一前端字段契约，合并媒体、关联、建议输入和富文本增强；不替代服务端校验。
- **规模**：155 行，6587 字节
- **内容校验**：SHA-256 `237eaae3754688560c7278eb7b0861fee652ab4cbf90431d7e21b4fc32d0aab2`

## 直接依赖

- `~~/shared/admin/content-modules`
- `./complete-resource`
- `../shared/admin/special-fields`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `controlFor` | 函数，第 64 行 | 优先采用特殊字段增强类型，否则把基础类型映射为受支持控件，未知类型回退文本输入。 |
| `normalizedOptions` | 函数，第 73 行 | 把两套字段选项归一为不可变 value/label/managed 列表。 |
| `enhancedHelp` | 函数，第 81 行 | 为历史建议字段补充共享候选与多分类分号输入提示。 |
| `contentEditorFieldDescriptor` | 函数，第 90 行 | 把一个 content 字段转换为 UI 描述，保留约束并使用布尔值模式。 |
| `completeEditorFieldDescriptor` | 函数，第 118 行 | 把一个 complete 字段转换为 UI 描述，保留关联信息并使用整数布尔值模式。 |
| `contentEditorFieldDescriptors` | 函数，第 149 行 | 逐字段适配 content 模块并冻结结果，交给统一字段渲染器。 |
| `completeEditorFieldDescriptors` | 函数，第 153 行 | 逐字段适配 complete 资源并冻结结果，交给统一字段渲染器。 |

### 调用签名

- `controlFor`：`function controlFor(baseControl: string, enhancement: AdminSpecialFieldSpec | null): AdminEditorControl`
- `normalizedOptions`：`function normalizedOptions(options: readonly CompleteResourceOption[] | readonly { readonly value: string; readonly label: string }[] | undefined): readonly AdminEditorOption[]`
- `enhancedHelp`：`function enhancedHelp(value: string | undefined, enhancement: AdminSpecialFieldSpec | null): string`
- `contentEditorFieldDescriptor`：`export function contentEditorFieldDescriptor(module: string, field: AdminFieldDefinition): AdminEditorFieldDescriptor`
- `completeEditorFieldDescriptor`：`export function completeEditorFieldDescriptor(resourceKey: string, field: CompleteResourceField): AdminEditorFieldDescriptor`
- `contentEditorFieldDescriptors`：`export function contentEditorFieldDescriptors(definition: AdminContentModuleDefinition): readonly AdminEditorFieldDescriptor[]`
- `completeEditorFieldDescriptors`：`export function completeEditorFieldDescriptors(resource: CompleteResourceSchema): readonly AdminEditorFieldDescriptor[]`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
