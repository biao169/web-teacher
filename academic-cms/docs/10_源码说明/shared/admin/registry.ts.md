# shared / admin / registry.ts

## 文件定位

- **源码路径**：`shared/admin/registry.ts`
- **文件类型**：程序模块
- **功能定位**：后台共享注册表与路径定义；作为前端导航和服务端权限映射的共同依据。
- **规模**：218 行，13598 字节
- **内容校验**：SHA-256 `3d78b160b1f650e87756062a756cf6e33d920f3985d6fd4f1842675e17e53d38`

## 直接依赖

- `../enums/auth`
- `../utils/redirect`
- `./content-modules`

## 直接调用方

- `app/admin/icons.ts`
- `app/components/admin/Breadcrumbs.vue`
- `app/components/admin/ModulePlaceholder.vue`
- `app/components/admin/Sidebar.vue`
- `app/components/admin/SidebarNavigation.vue`
- `app/components/admin/Topbar.vue`
- `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- `app/components/admin/complete/AdminCompleteLogWorkspace.vue`
- `app/components/admin/complete/AdminCompleteMediaPicker.vue`
- `app/components/admin/complete/AdminCompleteMediaWorkspace.vue`
- `app/components/admin/complete/AdminCompleteNewsEditor.vue`
- `app/components/admin/complete/AdminCompleteResourceWorkspace.vue`
- `app/components/admin/complete/AdminCompleteTransferWorkspace.vue`
- `app/components/admin/complete/AdminCompleteTranslationWorkspace.vue`
- `app/components/admin/content/Editor.vue`
- `app/composables/useAdminShell.ts`
- `app/middleware/admin-auth.global.ts`
- `app/pages/admin/[...path].vue`
- `app/pages/admin/index.vue`
- `scripts/test-admin-full-regression-runtime.ts`
- `server/api/v1/admin/capabilities.get.ts`
- `server/services/complete-admin/auth-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `normalizeAdminPath` | 函数，第 61 行 | 规范化 Admin Path，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `adminModule` | 函数，第 71 行 | 封装 Module 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `adminModuleForPath` | 函数，第 77 行 | 封装 Module For Path 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `isAdminSpecialPath` | 函数，第 86 行 | 检查 Admin Special Path 是否满足业务、安全或类型约束 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `hasAdminPermission` | 函数，第 96 行 | 检查 Admin Permission 是否满足业务、安全或类型约束 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `visibleAdminModules` | 函数，第 100 行 | 封装 Admin Modules 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `visibleAdminNavigation` | 函数，第 113 行 | 封装 Admin Navigation 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `adminChildPage` | 函数，第 150 行 | 封装 Child Page 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `routeQuery` | 函数，第 157 行 | 封装 Query 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `safeRouteRecordKey` | 函数，第 164 行 | 封装 Route Record Key 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `queryEditorLabel` | 函数，第 169 行 | 返回 Editor Label 对应的界面显示文本 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `adminGroupLandingPath` | 函数，第 179 行 | 封装 Group Landing Path 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |
| `adminBreadcrumbs` | 函数，第 188 行 | 封装 Breadcrumbs 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/admin/icons.ts`、`app/components/admin/Breadcrumbs.vue`、`app/components/admin/complete/AdminCompleteAuthWorkspace.vue` 等模块导入使用。 |

### 调用签名

- `normalizeAdminPath`：`function normalizeAdminPath(value: string): string | null`
- `adminModule`：`export function adminModule(module: AuthModule): AdminModuleDefinition`
- `adminModuleForPath`：`export function adminModuleForPath(value: string): AdminModuleDefinition | null`
- `isAdminSpecialPath`：`export function isAdminSpecialPath(value: string): boolean`
- `hasAdminPermission`：`export function hasAdminPermission(user: AdminPermissionSubject | null | undefined, module: AuthModule, action: PermissionAction = 'view'): boolean`
- `visibleAdminModules`：`export function visibleAdminModules(user: AdminPermissionSubject | null | undefined): AdminModuleDefinition[]`
- `visibleAdminNavigation`：`export function visibleAdminNavigation(user: AdminPermissionSubject | null | undefined): AdminNavigationGroup[]`
- `adminChildPage`：`function adminChildPage(path: string): AdminChildPageDefinition | null`
- `routeQuery`：`function routeQuery(value: string): URLSearchParams`
- `safeRouteRecordKey`：`function safeRouteRecordKey(value: string | null): string | null`
- `queryEditorLabel`：`function queryEditorLabel(value: string, selected: AdminModuleDefinition): string | null`
- `adminGroupLandingPath`：`export function adminGroupLandingPath(groupId: AdminGroupId, user?: AdminPermissionSubject | null): string | null`
- `adminBreadcrumbs`：`export function adminBreadcrumbs(value: string, user?: AdminPermissionSubject | null): AdminBreadcrumbItem[]`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ADMIN_GROUPS` | 导出常量，第 5 行 | 提供 ADMIN GROUPS 的共享配置或不可变数据 |
| `AdminGroupId` | 类型，第 14 行 | 约束 Admin Group Id 的数据结构或可选值 |
| `AdminIconName` | 类型，第 16 行 | 约束 Admin Icon Name 的数据结构或可选值 |
| `AdminModuleDefinition` | 接口，第 21 行 | 约束 Admin Module Definition 的数据结构或可选值 |
| `ADMIN_MODULES` | 导出常量，第 34 行 | 提供 ADMIN MODULES 的共享配置或不可变数据 |
| `AdminPermissionSubject` | 接口，第 91 行 | 约束 Admin Permission Subject 的数据结构或可选值 |
| `AdminNavigationGroup` | 接口，第 106 行 | 约束 Admin Navigation Group 的数据结构或可选值 |
| `AdminBreadcrumbItem` | 接口，第 120 行 | 约束 Admin Breadcrumb Item 的数据结构或可选值 |
| `AdminChildPageDefinition` | 接口，第 122 行 | 约束 Admin Child Page Definition 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
