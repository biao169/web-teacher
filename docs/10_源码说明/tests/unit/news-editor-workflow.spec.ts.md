# tests / unit / news-editor-workflow.spec.ts

## 文件定位

- **源码路径**：`tests/unit/news-editor-workflow.spec.ts`
- **文件类型**：测试模块
- **功能定位**：挂载新闻基础编辑器，验收富文本交接、草稿创建、失败保留、单次完成事件及快速保存/删除互斥。
- **规模**：124 行，8114 字节
- **内容校验**：SHA-256 `c9ee33838c6e4047c967652a1a025ece985f0e636f6f07a2c67b695ec891c6d3`

## 接入与状态约定

挂载新闻基础编辑器，验收富文本交接、草稿创建、失败保留、单次完成事件及快速保存/删除互斥。

## 直接依赖

- `vitest`
- `vue`
- `element-plus`
- `../../shared/complete-admin/core.mjs`
- `../../app/admin/complete-resource`
- `../../app/components/admin/complete/AdminCompleteRecordEditor.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `settle` | 函数，第 36 行 | 按参数执行本文件的 settle 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `mount` | 函数，第 37 行 | 按参数执行本文件的 mount 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `fill` | 函数，第 43 行 | 按参数执行本文件的 fill 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `openTool` | 函数，第 47 行 | 按参数执行本文件的 openTool 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |

### 调用签名

- `settle`：`async function settle()`
- `mount`：`async function mount(uid?: string, canEditNews = true, canDelete = false)`
- `fill`：`async function fill(field: string, value: string)`
- `openTool`：`async function openTool()`

## 行为覆盖

- opens an existing clean record without a redundant save
- saves edits with concurrency protection before opening, without starting a list refresh
- validates a new record, then creates a hidden draft and opens its returned UID
- retains input when saving fails, and does not open the tool
- opens existing HTML without exposing it to the ordinary content writer
- does not save or navigate when the account cannot edit news
- emits one save-and-return completion without an overlapping back event
- prevents rapid saves and delete from running together before the UI rerenders

运行：`pnpm exec vitest run tests/unit/news-editor-workflow.spec.ts`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
