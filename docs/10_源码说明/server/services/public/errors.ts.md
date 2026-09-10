# server / services / public / errors.ts

## 文件定位

- **源码路径**：`server/services/public/errors.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：9 行，337 字节
- **内容校验**：SHA-256 `e76886a8a642c72b6b00deadd71e54ef1e0047f497a8a99f7dc3e13e4330cc32`

## 直接调用方

- `server/services/public/modules/courses.ts`
- `server/services/public/modules/news.ts`
- `server/services/public/modules/patents.ts`
- `server/services/public/modules/projects.ts`
- `server/services/public/modules/publications.ts`
- `server/services/public/modules/students.ts`
- `server/services/public/modules/team.ts`
- `server/services/public/public-content-blocks.ts`
- `server/services/public/public-content-store.ts`
- `server/services/public/public-home-service.ts`
- `server/services/public/public-home-store.ts`
- `server/services/public/public-localization.ts`
- `server/services/public/public-page.ts`
- `server/services/public/public-query.ts`
- `server/services/public/public-row.ts`
- `server/services/public/public-shell-store.ts`
- `server/services/public/public-values.ts`
- `server/utils/public-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `PublicSiteError.constructor` | 构造方法，第 4 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/modules/courses.ts`、`server/services/public/modules/news.ts`、`server/services/public/modules/patents.ts` 等模块导入使用。 |

### 调用签名

- `PublicSiteError.constructor`：`constructor(readonly code: PublicSiteErrorCode, message: string, options?: ErrorOptions)`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PublicSiteErrorCode` | 类型，第 1 行 | 约束 Public Site Error Code 的数据结构或可选值 |
| `PublicSiteError` | 类，第 3 行 | 封装 Public Site Error 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
