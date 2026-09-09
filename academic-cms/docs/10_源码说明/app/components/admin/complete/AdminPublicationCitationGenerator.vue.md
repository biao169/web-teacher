# app / components / admin / complete / AdminPublicationCitationGenerator.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminPublicationCitationGenerator.vue`
- **文件类型**：Vue 组件
- **功能定位**：从当前论文输入和主页教师中英文姓名生成多种引用与高亮文本；逐字段预览后应用，最终写入仍由编辑器保存。
- **规模**：177 行，9023 字节
- **内容校验**：SHA-256 `b8c0c26ad0cf80c47bdff4993ab70938d20bf90d61761a3afdfa6e247bc3621f`

## 直接依赖

- `@lucide/vue`
- `element-plus`
- `~/admin/errors`
- `~~/shared/admin/publication-tools`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `selectedCount` | computed 派生状态，第 54 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `recordText` | 函数，第 56 行 | 从论文表单读取字段，空值转为空字符串以便引用生成。 |
| `extractHomepageProfile` | 函数，第 61 行 | 读取启用网站设置指定的公开主页教师姓名；失败保留提示，返回可用于高亮的名称列表。 |
| `generateAll` | 函数，第 84 行 | 使用当前字段和教师姓名生成引用提案，显示差异与缺失字段提示，不直接保存。 |
| `applySelected` | 函数，第 111 行 | 将已勾选的提案字段发给父编辑器；用户仍需保存，原值撤销由父编辑器维护。 |

### 调用签名

- `selectedCount`：`selectedCount = computed(() => proposal.value.filter(row => row.selected).length)`
- `recordText`：`function recordText(field: string): string`
- `extractHomepageProfile`：`async function extractHomepageProfile(showSuccess = true): Promise<readonly string[]>`
- `generateAll`：`async function generateAll(): Promise<void>`
- `applySelected`：`function applySelected(): void`

## 模板接入

子组件：`ElAlert`、`ElButton`、`ElCheckbox`、`ElTag`、`RefreshCw`、`UserRound`、`WandSparkles`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
