# server / security / visibility.ts

## 文件定位

- **源码路径**：`server/security/visibility.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：38 行，1579 字节
- **内容校验**：SHA-256 `a244baa2b5c2d5436be80729bb2077c848e5f002bd6d4a6b865fba9f9cef12f5`

## 直接依赖

- `../../shared/enums/auth`
- `./permissions`

## 直接调用方

- `server/services/media/media-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `canAccessVisibility` | 函数，第 11 行 | Hidden is an administrator scope. Owner requires an exact user UID match. | 由 `server/services/media/media-service.ts` 等模块导入使用。 |
| `readableNonOwnerScopes` | 函数，第 21 行 | Database-safe non-owner scopes. Owner rows still need an explicit owner UID predicate. | 由 `server/services/media/media-service.ts` 等模块导入使用。 |
| `filterByVisibility` | 函数，第 26 行 | 按条件查询或整理 By Visibility，返回可消费的结果集 | 由 `server/services/media/media-service.ts` 等模块导入使用。 |

### 调用签名

- `canAccessVisibility`：`export function canAccessVisibility(`
- `readableNonOwnerScopes`：`export function readableNonOwnerScopes(principal: AuthenticatedPrincipal | null): readonly VisibilityScope[]`
- `filterByVisibility`：`export function filterByVisibility<T>( rows: readonly T[], principal: AuthenticatedPrincipal | null, visibilityOf: (row: T) => VisibilityScope, ownerOf?: (row: T) => string | null…`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `VisibilityDecisionInput` | 接口，第 4 行 | 约束 Visibility Decision Input 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
