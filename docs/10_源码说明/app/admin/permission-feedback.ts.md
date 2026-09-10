# app / admin / permission-feedback.ts

## 文件定位

- **源码路径**：`app/admin/permission-feedback.ts`
- **文件类型**：程序模块
- **功能定位**：后台前端基础模块；提供 API、格式化、权限反馈或统一列表等通用能力。
- **规模**：31 行，1046 字节
- **内容校验**：SHA-256 `77590fa9f26731e91decd2a17fee3f26f2d770eeaee88db714ebeafc5e2f906c`

## 直接依赖

- `element-plus`

## 直接调用方

- `app/composables/useCompleteAdminApi.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `showAdminPermissionDenied` | 函数，第 10 行 | Display one permission dialog even when a failed request is observed by both | 由 `app/composables/useCompleteAdminApi.ts` 等模块导入使用。 |

### 调用签名

- `showAdminPermissionDenied`：`export function showAdminPermissionDenied(error?: unknown, message = '当前账号没有访问该后台功能的权限。'): Promise<void>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
