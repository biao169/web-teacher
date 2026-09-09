# app / components / admin / complete / AdminPublicationMetadataAssistant.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminPublicationMetadataAssistant.vue`
- **文件类型**：Vue 组件
- **功能定位**：粘贴引文解析与 DOI/标题联网查新工具；显示换源结果和字段差异，应用后允许编辑器撤销。
- **规模**：281 行，12022 字节
- **内容校验**：SHA-256 `d09febbdb1785af6072272628b99a283bcd56c762151dabd7aa4989ba521dd74`

## 直接依赖

- `@lucide/vue`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/errors`
- `~~/shared/admin/publication-tools`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `providerOptions` | computed 派生状态，第 65 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `selectedCount` | computed 派生状态，第 72 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `formatLabel` | computed 派生状态，第 73 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `displayValue` | 函数，第 96 行 | 把空值显示为“（空）”，其他值转为可比较文本。 |
| `setProposal` | 函数，第 101 行 | 保留白名单字段中与当前表单不同的非空结果，形成勾选应用列表。 |
| `parseCitation` | 函数，第 115 行 | 解析粘贴文本，展示识别格式、置信度和解析备注，再建立差异提案。 |
| `lookupFrom` | 函数，第 130 行 | 按 DOI 或标题调用所选查新源，显示各源状态、相似度与可用字段。 |
| `applySelected` | 函数，第 170 行 | 将已勾选的提案字段发给父编辑器；用户仍需保存，原值撤销由父编辑器维护。 |
| `statusTone` | 函数，第 180 行 | 把查新成功、限流或失败状态映射为提示颜色。 |
| `statusLabel` | 函数，第 187 行 | 把查新状态码映射为界面标签。 |

### 调用签名

- `providerOptions`：`providerOptions = computed(() => [`
- `selectedCount`：`selectedCount = computed(() => proposal.value.filter(row => row.selected).length)`
- `formatLabel`：`formatLabel = computed(() => {`
- `displayValue`：`function displayValue(value: unknown): string`
- `setProposal`：`function setProposal(fields: PublicationMetadataFields, source: string): void`
- `parseCitation`：`function parseCitation(): void`
- `lookupFrom`：`async function lookupFrom(preferred: 'doi' | 'title' | 'auto' = 'auto'): Promise<void>`
- `applySelected`：`function applySelected(): void`
- `statusTone`：`function statusTone(status: LookupAttempt['status']): 'success' | 'warning' | 'danger' | 'info'`
- `statusLabel`：`function statusLabel(status: LookupAttempt['status']): string`

## 模板接入

子组件：`ElAlert`、`ElButton`、`ElCheckbox`、`ElInput`、`ElOption`、`ElSelect`、`ElTag`、`RotateCcw`、`Search`、`WandSparkles`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
