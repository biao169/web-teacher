# shared / contracts / view-model.ts

## 文件定位

- **源码路径**：`shared/contracts/view-model.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享契约；定义请求、响应及领域数据的 TypeScript 类型。
- **规模**：9 行，475 字节
- **内容校验**：SHA-256 `7bdb9b25ca67eea9079274759602d9b81656f99b0de0d82b537390235dffbfdd`

## 直接调用方

- `server/cache/public-cache.ts`
- `server/services/public/public-home-service.ts`
- `server/services/public/public-result.ts`
- `server/services/public/public-shell-service.ts`
- `server/view-model/serializer.ts`
- `shared/contracts/public-site.ts`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PublicJsonPrimitive` | 类型，第 1 行 | 约束 Public Json Primitive 的数据结构或可选值 |
| `PublicJsonValue` | 类型，第 2 行 | 约束 Public Json Value 的数据结构或可选值 |
| `PublicViewModel` | 类型，第 3 行 | 约束 Public View Model 的数据结构或可选值 |
| `ViewModelPrimitive` | 类型，第 6 行 | 约束 View Model Primitive 的数据结构或可选值 |
| `ViewModelValue` | 类型，第 7 行 | 约束 View Model Value 的数据结构或可选值 |
| `ViewModelObject` | 类型，第 8 行 | 约束 View Model Object 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
