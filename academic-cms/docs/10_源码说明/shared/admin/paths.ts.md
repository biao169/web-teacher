# shared / admin / paths.ts

## 文件定位

- **源码路径**：`shared/admin/paths.ts`
- **文件类型**：程序模块
- **功能定位**：后台共享注册表与路径定义；作为前端导航和服务端权限映射的共同依据。
- **规模**：8 行，406 字节
- **内容校验**：SHA-256 `2682ad355b222ab6b40e885e77c76e3cac13233f9ada1fe153529c866c13b1af`

## 直接依赖

- `../utils/redirect`

## 直接调用方

- `app/components/admin/Topbar.vue`
- `app/components/admin/content/Editor.vue`
- `app/composables/useAdminApi.ts`
- `app/middleware/admin-auth.global.ts`
- `app/pages/admin/unavailable.vue`
- `app/plugins/admin-runtime.client.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `safeAdminReturnPath` | 函数，第 3 行 | 封装 Admin Return Path 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/components/admin/content/Editor.vue`、`app/components/admin/Topbar.vue`、`app/composables/useAdminApi.ts` 等模块导入使用。 |

### 调用签名

- `safeAdminReturnPath`：`export function safeAdminReturnPath(value: unknown, fallback = '/admin'): string`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
