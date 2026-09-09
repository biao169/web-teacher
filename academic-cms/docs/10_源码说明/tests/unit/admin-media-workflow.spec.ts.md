# tests / unit / admin-media-workflow.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-media-workflow.spec.ts`
- **文件类型**：测试模块
- **功能定位**：真实 Vue/Element Plus 组件的媒体竞态回归：预览源切换、搜索响应顺序、上传锁、即时显示、只读和引用未知状态。
- **规模**：143 行，9634 字节
- **内容校验**：SHA-256 `ff558669ac2a8e2347cbb40876a22e3910f27af38b0d3118dedc110cd50f69b0`

## 直接依赖

- `vitest`
- `vue`
- `vue-router`
- `../../app/components/admin/shared/AdminMediaPreview.vue`
- `../../app/components/admin/complete/AdminCompleteMediaPicker.vue`
- `../../app/components/admin/complete/AdminCompleteMediaWorkspace.vue`
- `../../app/admin/media`
- `../../app/admin/media-upload`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `row` | 函数变量，第 27 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |
| `deferred` | 函数，第 28 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |
| `settle` | 函数，第 34 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |
| `button` | 函数变量，第 35 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |
| `mount` | 函数，第 36 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |

### 调用签名

- `row`：`row = (uid: string): AdminMediaRow => …`
- `deferred`：`function deferred<T>()`
- `settle`：`async function settle()`
- `button`：`button = (label: string) => …`
- `mount`：`async function mount(component: typeof Preview | typeof Picker | typeof Workspace, props: Record<string, unknown> = {})`

## 验证内容

- ignores a late response for the previous object key
- resolves the managed object after a temporary local file is removed
- clears obsolete loading state when switching to a supplied URL, and supports retry
- keeps a read-only media field from opening the picker or starting requests
- keeps the latest search results when the first search finishes last
- keeps a new upload visible despite an old list response and locks close while uploading
- ignores obsolete library results and never enables recycling for an unreported usage count

运行：`pnpm exec vitest run tests/unit/admin-media-workflow.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
