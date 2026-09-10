# tests / unit / admin-editor-lifecycle.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-editor-lifecycle.spec.ts`
- **文件类型**：测试模块
- **功能定位**：使用真实 Vue Router 内存路由验收共用生命周期及编辑壳：取消、互斥、返回、过期请求、卸载和键盘保存。
- **规模**：141 行，7528 字节
- **内容校验**：SHA-256 `29895d834053100470bfa1b21b357cf3283d419130120d158409a316d01b798b`

## 接入与状态约定

使用真实 Vue Router 内存路由验收共用生命周期及编辑壳：取消、互斥、返回、过期请求、卸载和键盘保存。

## 直接依赖

- `vitest`
- `vue`
- `vue-router`
- `element-plus`
- `../../app/composables/useAdminEditorLifecycle`
- `../../app/components/admin/shared/AdminEditorShell.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `deferred` | 函数，第 15 行 | 按参数执行本文件的 deferred 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `mountEditor` | 函数，第 21 行 | 按参数执行本文件的 mountEditor 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |

### 调用签名

- `deferred`：`function deferred<T = void>()`
- `mountEditor`：`async function mountEditor()`

## 行为覆盖

- cancelling a same-page object switch preserves the URL and dirty form
- confirms returning once and keeps the list page and filters
- guards path changes and tab switches, but allows list-query normalization
- locks before a request or delete confirmation and blocks navigation even on a clean form
- releases a failed operation without clearing the draft or granting navigation
- allows save-and-return only after the successful write marks the form clean
- blocks save while the rich-text media tool is working
- shares one discard dialog and suppresses a save while navigation confirmation is pending
- expires stale record loads and removes unload protection when unmounted
- freezes fields, back and save shortcuts while an operation is pending, then unlocks

运行：`pnpm exec vitest run tests/unit/admin-editor-lifecycle.spec.ts`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
