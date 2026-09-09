# app / admin / query-client.ts

## 文件定位

- **源码路径**：`app/admin/query-client.ts`
- **文件类型**：程序模块
- **功能定位**：后台前端基础模块；提供 API、格式化、权限反馈或统一列表等通用能力。
- **规模**：30 行，1524 字节
- **内容校验**：SHA-256 `d4b899f7a93f77307ebbaa9610462791fa66014691442d2ea8697d83f9a364b4`

## 直接依赖

- `./errors`
- `@tanstack/vue-query`

## 直接调用方

- `app/components/admin/Topbar.vue`
- `app/components/admin/content/Editor.vue`
- `app/components/admin/content/List.vue`
- `app/composables/useAdminApi.ts`
- `app/composables/useAdminDashboard.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `shouldRetry` | 函数，第 5 行 | 封装 Retry 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `getAdminQueryClient` | 函数，第 10 行 | 读取或定位 Admin Query Client，向调用方返回匹配结果 | 由 `app/components/admin/content/Editor.vue`、`app/components/admin/content/List.vue`、`app/components/admin/Topbar.vue` 等模块导入使用。 |
| `onError` | 对象函数，第 13 行 | 响应 Error 相关事件，协调后续业务流程 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `onError` | 对象函数，第 14 行 | 响应 Error 相关事件，协调后续业务流程 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `retryDelay` | 对象函数，第 16 行 | 封装 Delay 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `list` | 对象函数，第 26 行 | 收集 list 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `detail` | 对象函数，第 27 行 | 封装 detail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `suggestions` | 对象函数，第 28 行 | 封装 suggestions 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `shouldRetry`：`function shouldRetry(failureCount: number, error: unknown): boolean`
- `getAdminQueryClient`：`export function getAdminQueryClient(onFailure?: (error: unknown) => void): QueryClient`
- `onError`：`onError: error => failureHandler?.(error)`
- `onError`：`onError: error => failureHandler?.(error)`
- `retryDelay`：`retryDelay: attempt => Math.min(750 * 2 ** attempt, 4_000)`
- `list`：`list: (module: string, query: unknown) => ['admin', 'list', module, query] as const`
- `detail`：`detail: (module: string, uid: string) => ['admin', 'detail', module, uid] as const`
- `suggestions`：`suggestions: (module: string, field: string, query: string) => ['admin', 'suggestions', module, field, query] as const`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `adminQueryKeys` | 导出常量，第 23 行 | 提供 admin Query Keys 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
